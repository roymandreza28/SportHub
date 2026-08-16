<?php

namespace App\Services;

use App\Events\BracketUpdated;
use App\Events\RoundAdvanced;
use App\Models\Bracket;
use App\Models\GameMatch;
use App\Models\Tournament;
use Illuminate\Support\Collection;

class BracketService
{
    public function generate(Tournament $tournament): Bracket
    {
        $playerIds = $tournament->registrations()
            ->whereIn('status', ['pending', 'confirmed'])
            ->pluck('user_id')
            ->shuffle()
            ->values();

        $bracket = $tournament->bracket()->create(['current_round' => 1]);

        match ($tournament->format) {
            'round_robin' => $this->generateRoundRobin($bracket, $playerIds),
            'group_stage' => $this->generateGroupStage($bracket, $playerIds),
            'double_elimination' => $this->generateDoubleElimination($bracket, $playerIds),
            'swiss' => $this->generateSwiss($bracket, $playerIds),
            default => $this->generateSingleElimination($bracket, $playerIds),
        };

        $bracket->update(['structure' => $this->buildStructure($bracket)]);

        $bracket = $bracket->fresh();
        BracketUpdated::dispatch($bracket);

        $this->notifyParticipants($tournament, "The bracket for {$tournament->name} is set — check your matchup!");

        return $bracket;
    }

    protected function generateRoundRobin(Bracket $bracket, Collection $playerIds, ?int $groupNumber = null, int $round = 1): void
    {
        for ($i = 0; $i < $playerIds->count(); $i++) {
            for ($j = $i + 1; $j < $playerIds->count(); $j++) {
                $bracket->matches()->create([
                    'round' => $round,
                    'group_number' => $groupNumber,
                    'participant_a_id' => $playerIds[$i],
                    'participant_b_id' => $playerIds[$j],
                    'status' => 'scheduled',
                ]);
            }
        }
    }

    // ---- Group stage: round-robin pools, then a single-elimination knockout ----

    protected function generateGroupStage(Bracket $bracket, Collection $playerIds): void
    {
        $numGroups = max(1, (int) ceil($playerIds->count() / 4));

        // Deal players into groups round-robin style (like dealing cards) so
        // group sizes differ by at most 1 — a flat chunk(4) could otherwise
        // leave a trailing group of a single player, which can't round-robin.
        $groups = collect(range(0, $numGroups - 1))->mapWithKeys(fn ($g) => [$g => collect()]);
        foreach ($playerIds->values() as $i => $playerId) {
            $groups[$i % $numGroups]->push($playerId);
        }

        foreach ($groups as $groupNumber => $members) {
            $this->generateRoundRobin($bracket, $members, $groupNumber);
        }
    }

    /**
     * Called after every group_stage match completes. Once every group match
     * is done, ranks each group (wins, then point differential, then points
     * scored) and seeds the top 2 from each group into a single-elimination
     * knockout stage — reusing the same generation code plain
     * single_elimination tournaments use, just starting one round after the
     * group phase and skipping the shuffle (qualifiers are already ranked).
     */
    protected function maybeStartGroupKnockout(Bracket $bracket): void
    {
        $groupMatches = $bracket->matches()->whereNotNull('group_number')->get();

        if ($groupMatches->contains(fn (GameMatch $m) => $m->status !== 'completed')) {
            return;
        }

        // Knockout stage already generated (a later group's final match
        // triggering this same check again) — nothing left to do.
        if ($bracket->matches()->whereNull('group_number')->exists()) {
            return;
        }

        $standings = $groupMatches->groupBy('group_number')->map(fn (Collection $matches) => $this->rankGroup($matches));

        $ranked1 = $standings->map(fn ($s) => $s->get(0))->filter()->values();
        $ranked2 = $standings->map(fn ($s) => $s->get(1))->filter()->values();

        // Cross-seed so a group's own top 2 don't immediately rematch in
        // round 1 of the knockout: every group winner, then every runner-up
        // in reverse group order.
        $qualifiers = $ranked1->concat($ranked2->reverse()->values())->pluck('id')->values();

        $startRound = $groupMatches->max('round') + 1;

        $this->generateSingleElimination($bracket, $qualifiers, $startRound);
    }

    private function rankGroup(Collection $matches): Collection
    {
        $stats = collect();

        foreach ($matches as $match) {
            foreach ([
                [$match->participant_a_id, $match->score_a, $match->score_b],
                [$match->participant_b_id, $match->score_b, $match->score_a],
            ] as [$playerId, $scoredFor, $scoredAgainst]) {
                if (! $playerId) {
                    continue;
                }

                $entry = $stats->get($playerId, ['id' => $playerId, 'wins' => 0, 'for' => 0, 'against' => 0]);
                $entry['for'] += $scoredFor;
                $entry['against'] += $scoredAgainst;
                if ($match->winner_id === $playerId) {
                    $entry['wins']++;
                }
                $stats->put($playerId, $entry);
            }
        }

        return $stats->values()->sort(fn ($a, $b) => $b['wins'] <=> $a['wins']
            ?: ($b['for'] - $b['against']) <=> ($a['for'] - $a['against'])
            ?: $b['for'] <=> $a['for']
        )->values();
    }

    // ---- Single elimination (also serves group_stage's knockout phase) ----

    protected function generateSingleElimination(Bracket $bracket, Collection $playerIds, int $startRound = 1): void
    {
        $count = max($playerIds->count(), 2);
        $bracketSize = 2 ** (int) ceil(log($count, 2));
        $totalRounds = (int) log($bracketSize, 2);
        $roundCount = $bracketSize / 2;
        $numByes = $bracketSize - $count;

        // Distribute byes one-per-match (byes < matches whenever byes > 0, since
        // bracketSize is the smallest power of 2 >= count) so no match ever pairs
        // two byes against each other.
        $players = $playerIds->values();
        $slots = [];
        $cursor = 0;
        for ($i = 0; $i < $roundCount; $i++) {
            if ($i < $numByes) {
                $slots[] = $players[$cursor++];
                $slots[] = null;
            } else {
                $slots[] = $players[$cursor++];
                $slots[] = $players[$cursor++];
            }
        }
        $slots = collect($slots);

        $completedByeMatches = [];

        for ($i = 0; $i < $roundCount; $i++) {
            $a = $slots[$i * 2];
            $b = $slots[$i * 2 + 1];
            $isBye = is_null($a) || is_null($b);
            $winnerId = $isBye ? ($a ?? $b) : null;

            $match = $bracket->matches()->create([
                'round' => $startRound,
                'participant_a_id' => $a,
                'participant_b_id' => $b,
                'status' => $isBye ? 'completed' : 'scheduled',
                'winner_id' => $winnerId,
            ]);

            if ($isBye && $winnerId) {
                $completedByeMatches[] = $match;
            }
        }

        for ($round = $startRound + 1; $round < $startRound + $totalRounds; $round++) {
            $matchesThisRound = $roundCount / (2 ** ($round - $startRound));
            for ($i = 0; $i < $matchesThisRound; $i++) {
                $bracket->matches()->create(['round' => $round, 'status' => 'scheduled']);
            }
        }

        foreach ($completedByeMatches as $match) {
            $this->advanceWinner($match);
        }
    }

    // ---- Double elimination ----

    protected function generateDoubleElimination(Bracket $bracket, Collection $playerIds): void
    {
        $count = max($playerIds->count(), 2);
        $bracketSize = 2 ** (int) ceil(log($count, 2));
        $totalWbRounds = (int) log($bracketSize, 2);
        $roundCount = $bracketSize / 2;
        $numByes = $bracketSize - $count;

        $players = $playerIds->values();
        $slots = [];
        $cursor = 0;
        for ($i = 0; $i < $roundCount; $i++) {
            if ($i < $numByes) {
                $slots[] = $players[$cursor++];
                $slots[] = null;
            } else {
                $slots[] = $players[$cursor++];
                $slots[] = $players[$cursor++];
            }
        }
        $slots = collect($slots);

        $wbR1IsBye = [];
        $completedByeMatches = [];

        for ($i = 0; $i < $roundCount; $i++) {
            $a = $slots[$i * 2];
            $b = $slots[$i * 2 + 1];
            $isBye = is_null($a) || is_null($b);
            $wbR1IsBye[$i] = $isBye;
            $winnerId = $isBye ? ($a ?? $b) : null;

            $match = $bracket->matches()->create([
                'round' => 1,
                'bracket_type' => 'winners',
                'participant_a_id' => $a,
                'participant_b_id' => $b,
                'status' => $isBye ? 'completed' : 'scheduled',
                'winner_id' => $winnerId,
            ]);

            if ($isBye && $winnerId) {
                $completedByeMatches[] = $match;
            }
        }

        for ($round = 2; $round <= $totalWbRounds; $round++) {
            $matchesThisRound = $roundCount / (2 ** ($round - 1));
            for ($i = 0; $i < $matchesThisRound; $i++) {
                $bracket->matches()->create(['round' => $round, 'bracket_type' => 'winners', 'status' => 'scheduled']);
            }
        }

        // A losers bracket (and grand final) only make sense once there's an
        // actual winners bracket beyond a single match — with just 2
        // entrants, that one match is already decisive.
        if ($totalWbRounds >= 2) {
            $totalLbRounds = 2 * ($totalWbRounds - 1);

            for ($r = 1; $r <= $totalLbRounds; $r++) {
                $matchCount = $this->losersBracketRoundSize($bracketSize, $r);
                for ($i = 0; $i < $matchCount; $i++) {
                    // Round 1 pairs adjacent winners-bracket round-1 losers —
                    // skip a pairing where BOTH feeders were byes, since
                    // neither ever produces a real loser to send here.
                    // (Winners-bracket byes only ever happen in round 1, so
                    // this is the only losers round that can have gaps.)
                    if ($r === 1 && ($wbR1IsBye[$i * 2] ?? false) && ($wbR1IsBye[$i * 2 + 1] ?? false)) {
                        continue;
                    }

                    $bracket->matches()->create([
                        'round' => 100 + $r,
                        'bracket_type' => 'losers',
                        'bracket_position' => $i,
                        'status' => 'scheduled',
                    ]);
                }
            }

            $bracket->matches()->create(['round' => 200, 'bracket_type' => 'final', 'status' => 'scheduled']);
        }

        foreach ($completedByeMatches as $match) {
            $this->advanceWinner($match);
        }
    }

    /**
     * Losers-bracket rounds alternate between merging survivors of the
     * previous round together and merging survivors with a fresh batch of
     * winners-bracket losers dropping in. See losersBracketRoundSize() and
     * advanceDoubleEliminationLosers() for the full shape.
     */
    private function losersBracketRoundSize(int $bracketSize, int $round): int
    {
        $k = (int) ceil($round / 2);

        return intdiv($bracketSize, 2 ** ($k + 1));
    }

    private function advanceDoubleElimination(GameMatch $match): void
    {
        $bracket = $match->bracket;
        $tournament = $bracket->tournament;

        match ($match->bracket_type) {
            'winners' => $this->advanceDoubleEliminationWinners($match, $bracket, $tournament),
            'losers' => $this->advanceDoubleEliminationLosers($match, $bracket, $tournament),
            'final' => $this->completeDoubleElimination($tournament),
            default => null,
        };

        $bracket->update(['structure' => $this->buildStructure($bracket)]);
        BracketUpdated::dispatch($bracket->fresh());
    }

    private function completeDoubleElimination(Tournament $tournament): void
    {
        $tournament->update(['status' => 'completed']);
        $this->notifyParticipants($tournament, "{$tournament->name} has ended — thanks for playing!");
    }

    private function advanceDoubleEliminationWinners(GameMatch $match, Bracket $bracket, Tournament $tournament): void
    {
        $maxWbRound = $bracket->matches()->where('bracket_type', 'winners')->max('round');
        $roundMatches = $bracket->matches()->where('bracket_type', 'winners')->where('round', $match->round)->orderBy('id')->get();
        $index = $roundMatches->search(fn (GameMatch $m) => $m->id === $match->id);
        $loserId = $match->participant_a_id === $match->winner_id ? $match->participant_b_id : $match->participant_a_id;

        if ($match->round < $maxWbRound) {
            $nextRoundMatches = $bracket->matches()->where('bracket_type', 'winners')->where('round', $match->round + 1)->orderBy('id')->get();
            $nextMatch = $nextRoundMatches[intdiv($index, 2)];
            $slot = $index % 2 === 0 ? 'participant_a_id' : 'participant_b_id';
            $nextMatch->update([$slot => $match->winner_id]);
        } else {
            $final = $bracket->matches()->where('bracket_type', 'final')->first();
            if ($final) {
                $final->update(['participant_a_id' => $match->winner_id]);
            } else {
                // No losers bracket exists (only 2 entrants total) — the
                // winners-bracket match is decisive on its own.
                $this->completeDoubleElimination($tournament);
            }
        }

        // Byes have no real loser to route anywhere.
        if ($loserId) {
            $this->dropIntoLosersBracket($bracket, $match->round, $index, $loserId);
        }
    }

    private function dropIntoLosersBracket(Bracket $bracket, int $wbRound, int $wbMatchIndex, int $loserId): void
    {
        if ($wbRound === 1) {
            $lbRoundOffset = 1;
            $lbPosition = intdiv($wbMatchIndex, 2);
            $slot = $wbMatchIndex % 2 === 0 ? 'participant_a_id' : 'participant_b_id';
        } else {
            $lbRoundOffset = 2 * ($wbRound - 1);
            $lbPosition = $wbMatchIndex;
            $slot = 'participant_b_id';
        }

        $lbMatch = $bracket->matches()->where('bracket_type', 'losers')
            ->where('round', 100 + $lbRoundOffset)
            ->where('bracket_position', $lbPosition)
            ->first();

        // Round 1 only: both feeders of this pairing were byes, so it was
        // never created — there's no one for this loser to play here.
        if (! $lbMatch) {
            return;
        }

        $lbMatch->update([$slot => $loserId]);

        if ($wbRound === 1) {
            // The only round where a losers-bracket match can be a "semi
            // bye" — if the sibling winners-bracket match feeding this
            // match's other slot was itself a bye, this loser has no
            // opponent here and advances automatically.
            $wbR1 = $bracket->matches()->where('bracket_type', 'winners')->where('round', 1)->orderBy('id')->get();
            $siblingIndex = $wbMatchIndex % 2 === 0 ? $wbMatchIndex + 1 : $wbMatchIndex - 1;
            $sibling = $wbR1[$siblingIndex] ?? null;
            $siblingIsBye = $sibling && (is_null($sibling->participant_a_id) || is_null($sibling->participant_b_id));

            if ($siblingIsBye) {
                $lbMatch->update(['status' => 'completed', 'winner_id' => $loserId]);
                $this->advanceWinner($lbMatch->fresh());
            }
        } else {
            // If the previous (odd) losers round has no match at this
            // position, it was skipped for the same both-byes reason above
            // — slot A here will never be filled, so this fresh dropper
            // advances automatically instead of waiting for an opponent.
            $prevRound = $lbRoundOffset - 1;
            $prevExists = $bracket->matches()->where('bracket_type', 'losers')
                ->where('round', 100 + $prevRound)
                ->where('bracket_position', $lbPosition)
                ->exists();

            if (! $prevExists) {
                $lbMatch->update(['status' => 'completed', 'winner_id' => $loserId]);
                $this->advanceWinner($lbMatch->fresh());
            }
        }
    }

    private function advanceDoubleEliminationLosers(GameMatch $match, Bracket $bracket, Tournament $tournament): void
    {
        $lbRound = $match->round - 100;
        $maxLbRound = $bracket->matches()->where('bracket_type', 'losers')->max('round') - 100;

        if ($lbRound >= $maxLbRound) {
            // Losers-bracket final: the winner becomes the LB champion,
            // waiting in the grand final's other slot.
            $final = $bracket->matches()->where('bracket_type', 'final')->first();
            $final?->update(['participant_b_id' => $match->winner_id]);

            return;
        }

        $position = $match->bracket_position;
        $nextRound = 100 + $lbRound + 1;

        if ($lbRound % 2 === 1) {
            // Odd round winner moves straight into the next (even) round,
            // same position, slot A — slot B there is filled separately by
            // that round's fresh winners-bracket dropper.
            $nextMatch = $bracket->matches()->where('bracket_type', 'losers')
                ->where('round', $nextRound)->where('bracket_position', $position)->first();
            $nextMatch?->update(['participant_a_id' => $match->winner_id]);
        } else {
            // Even round: winners of this round's adjacent positions merge
            // together into the next (odd) round.
            $nextPosition = intdiv($position, 2);
            $slot = $position % 2 === 0 ? 'participant_a_id' : 'participant_b_id';
            $nextMatch = $bracket->matches()->where('bracket_type', 'losers')
                ->where('round', $nextRound)->where('bracket_position', $nextPosition)->first();
            $nextMatch?->update([$slot => $match->winner_id]);
        }
    }

    // ---- Swiss system ----

    /**
     * A fixed number of rounds (ceil(log2(playerCount)), the standard Swiss
     * convention), no elimination — every round pairs players with similar
     * records so far. Standings after the final round decide the winner.
     */
    protected function generateSwiss(Bracket $bracket, Collection $playerIds): void
    {
        $this->pairSwissRound($bracket, $playerIds, 1);

        $byeMatches = $bracket->matches()->where('bracket_type', 'swiss')->where('round', 1)
            ->whereNull('participant_b_id')->get();

        foreach ($byeMatches as $match) {
            $this->advanceWinner($match);
        }
    }

    private function totalSwissRounds(int $playerCount): int
    {
        return max(1, (int) ceil(log(max($playerCount, 2), 2)));
    }

    /**
     * Pairs adjacent players in the given (standings-ordered, or shuffled for
     * round 1) order. A pairing that's already played once gets one local
     * swap attempt to reduce rematches — not a guarantee, but enough for a
     * municipal-scale field without the cost of full backtracking. An odd
     * field's bye goes to the lowest-ranked player who hasn't had one yet, so
     * the same player never sits out twice while others never do.
     */
    private function pairSwissRound(Bracket $bracket, Collection $orderedIds, int $round): void
    {
        $remaining = $orderedIds->values()->all();
        $pastPairs = $round > 1 ? $this->swissPastPairs($bracket) : collect();
        $priorByes = $round > 1 ? $this->swissPriorByeIds($bracket) : collect();
        $pairs = [];

        if (count($remaining) % 2 === 1) {
            $byeIndex = count($remaining) - 1;
            for ($i = count($remaining) - 1; $i >= 0; $i--) {
                if (! $priorByes->contains($remaining[$i])) {
                    $byeIndex = $i;
                    break;
                }
            }
            $pairs[] = [$remaining[$byeIndex], null];
            array_splice($remaining, $byeIndex, 1);
        }

        $i = 0;
        while ($i < count($remaining)) {
            $a = $remaining[$i];
            $b = $remaining[$i + 1] ?? null;

            if ($b !== null && isset($remaining[$i + 2]) && $pastPairs->contains($this->swissPairKey($a, $b))) {
                [$remaining[$i + 1], $remaining[$i + 2]] = [$remaining[$i + 2], $remaining[$i + 1]];
                $b = $remaining[$i + 1];
            }

            $pairs[] = [$a, $b];
            $i += 2;
        }

        foreach ($pairs as [$a, $b]) {
            $isBye = is_null($b);
            $bracket->matches()->create([
                'round' => $round,
                'bracket_type' => 'swiss',
                'participant_a_id' => $a,
                'participant_b_id' => $b,
                'status' => $isBye ? 'completed' : 'scheduled',
                'winner_id' => $isBye ? $a : null,
            ]);
        }
    }

    private function swissPairKey(int $a, int $b): string
    {
        return implode('-', [min($a, $b), max($a, $b)]);
    }

    private function swissPastPairs(Bracket $bracket): Collection
    {
        return $bracket->matches()->where('bracket_type', 'swiss')->whereNotNull('participant_b_id')->get()
            ->map(fn (GameMatch $m) => $this->swissPairKey($m->participant_a_id, $m->participant_b_id));
    }

    private function swissPriorByeIds(Bracket $bracket): Collection
    {
        return $bracket->matches()->where('bracket_type', 'swiss')->whereNull('participant_b_id')->pluck('participant_a_id');
    }

    private function maybeAdvanceSwissRound(Bracket $bracket, Tournament $tournament): void
    {
        $currentRound = (int) $bracket->matches()->where('bracket_type', 'swiss')->max('round');
        $roundMatches = $bracket->matches()->where('bracket_type', 'swiss')->where('round', $currentRound)->get();

        if ($roundMatches->contains(fn (GameMatch $m) => $m->status !== 'completed')) {
            $bracket->update(['structure' => $this->buildStructure($bracket)]);
            BracketUpdated::dispatch($bracket->fresh());

            return;
        }

        $playerCount = $tournament->registrations()->whereIn('status', ['pending', 'confirmed'])->count();
        $totalRounds = $this->totalSwissRounds($playerCount);

        if ($currentRound >= $totalRounds) {
            $tournament->update(['status' => 'completed']);
            $bracket->update(['structure' => $this->buildStructure($bracket)]);
            BracketUpdated::dispatch($bracket->fresh());

            $this->notifyParticipants($tournament, "{$tournament->name} has ended — thanks for playing!");

            return;
        }

        $standings = collect($this->swissStandings($bracket))->pluck('id');
        $nextRound = $currentRound + 1;
        $this->pairSwissRound($bracket, $standings, $nextRound);

        $bracket->update([
            'current_round' => $nextRound,
            'structure' => $this->buildStructure($bracket),
        ]);

        BracketUpdated::dispatch($bracket->fresh());
        RoundAdvanced::dispatch($tournament->id, $nextRound);
        $this->notifyParticipants($tournament, "Round {$nextRound} has started in {$tournament->name}.");

        $byeMatches = $bracket->matches()->where('bracket_type', 'swiss')->where('round', $nextRound)
            ->whereNull('participant_b_id')->get();

        foreach ($byeMatches as $match) {
            $this->advanceWinner($match);
        }
    }

    /**
     * Wins first, then point differential, then points scored — same
     * tiebreak chain as group_stage's rankGroup(), applied across every
     * swiss-tagged match played so far (a bye counts as a win with no
     * points either way).
     */
    private function swissStandings(Bracket $bracket): array
    {
        $matches = $bracket->matches()->where('bracket_type', 'swiss')->get();
        $stats = [];

        foreach ($matches as $match) {
            foreach ([
                [$match->participant_a_id, $match->score_a, $match->score_b],
                [$match->participant_b_id, $match->score_b, $match->score_a],
            ] as [$playerId, $scoredFor, $scoredAgainst]) {
                if (! $playerId) {
                    continue;
                }

                $stats[$playerId] ??= ['id' => $playerId, 'wins' => 0, 'for' => 0, 'against' => 0];
                $stats[$playerId]['for'] += $scoredFor;
                $stats[$playerId]['against'] += $scoredAgainst;
                if ($match->winner_id === $playerId) {
                    $stats[$playerId]['wins']++;
                }
            }
        }

        $stats = array_values($stats);

        usort($stats, fn ($a, $b) => $b['wins'] <=> $a['wins']
            ?: ($b['for'] - $b['against']) <=> ($a['for'] - $a['against'])
            ?: $b['for'] <=> $a['for']
        );

        return $stats;
    }

    /**
     * Place a decided match's winner into its next-round slot. This is a plain
     * fill only — it must NOT infer "the other slot is a bye" from it being
     * null, because null there is ambiguous: it can mean "permanently empty"
     * (true bye) or "not decided yet" (the sibling match hasn't been played).
     * That ambiguity doesn't need resolving: given byes are always fully
     * distributed one-per-match within round 1 (see generateSingleElimination),
     * byes never need to cascade past round 1 — every round 2+ match either
     * starts with two known participants (both its round-1 feeders were byes)
     * or waits for real play to fill it in, with no third case.
     */
    public function advanceWinner(GameMatch $match): void
    {
        $bracket = $match->bracket;
        $tournament = $bracket->tournament;

        if ($tournament->format === 'group_stage' && $match->group_number !== null) {
            $this->maybeStartGroupKnockout($bracket);
            $bracket->update(['structure' => $this->buildStructure($bracket)]);
            BracketUpdated::dispatch($bracket->fresh());

            return;
        }

        if ($tournament->format === 'double_elimination') {
            $this->advanceDoubleElimination($match);

            return;
        }

        if ($tournament->format === 'swiss') {
            $this->maybeAdvanceSwissRound($bracket, $tournament);

            return;
        }

        if (! in_array($tournament->format, ['single_elimination', 'group_stage'], true)) {
            return;
        }

        $roundMatches = $bracket->matches()->where('round', $match->round)->orderBy('id')->get();
        $index = $roundMatches->search(fn (GameMatch $m) => $m->id === $match->id);

        $nextRoundMatches = $bracket->matches()->where('round', $match->round + 1)->orderBy('id')->get();

        if ($nextRoundMatches->isEmpty()) {
            $tournament->update(['status' => 'completed']);
            $bracket->update(['structure' => $this->buildStructure($bracket)]);
            BracketUpdated::dispatch($bracket->fresh());

            $this->notifyParticipants($tournament, "{$tournament->name} has ended — thanks for playing!");

            return;
        }

        $nextMatch = $nextRoundMatches[intdiv($index, 2)];
        $slot = $index % 2 === 0 ? 'participant_a_id' : 'participant_b_id';
        $nextMatch->update([$slot => $match->winner_id]);

        $didAdvanceRound = $match->round + 1 > $bracket->current_round;

        $bracket->update([
            'current_round' => max($bracket->current_round, $match->round + 1),
            'structure' => $this->buildStructure($bracket),
        ]);

        BracketUpdated::dispatch($bracket->fresh());

        if ($didAdvanceRound) {
            RoundAdvanced::dispatch($tournament->id, $match->round + 1);
            $this->notifyParticipants($tournament, "Round {$nextMatch->round} has started in {$tournament->name}.");
        }
    }

    // Every registrant gets notified, not just the two players in the match
    // that triggered the advance — "your tournament moved forward" is
    // relevant to the whole field, not just whoever just played.
    private function notifyParticipants(Tournament $tournament, string $message): void
    {
        $tournament->registrations()->pluck('user_id')->unique()->each(
            fn ($userId) => NotificationService::send($userId, 'tournament_update', [
                'tournament_id' => $tournament->id,
                'tournament_name' => $tournament->name,
                'message' => $message,
            ])
        );
    }

    public function buildStructure(Bracket $bracket): array
    {
        return $bracket->matches()
            // The frontend bracket viewer renders straight from this
            // `structure` blob (not the sibling `matches` relation), so
            // participant/winner names have to be embedded here directly —
            // without this eager load every card would only have raw ids to
            // show.
            ->with(['participantA:id,name', 'participantB:id,name', 'winner:id,name'])
            ->orderBy('round')
            ->orderBy('id')
            ->get()
            ->groupBy('round')
            ->map(fn (Collection $matches) => $matches->map(fn (GameMatch $m) => [
                'id' => $m->id,
                'round' => $m->round,
                'group_number' => $m->group_number,
                'bracket_type' => $m->bracket_type,
                'participant_a_id' => $m->participant_a_id,
                'participant_b_id' => $m->participant_b_id,
                'participant_a' => $m->participantA ? ['id' => $m->participantA->id, 'name' => $m->participantA->name] : null,
                'participant_b' => $m->participantB ? ['id' => $m->participantB->id, 'name' => $m->participantB->name] : null,
                'score_a' => $m->score_a,
                'score_b' => $m->score_b,
                'status' => $m->status,
                'winner_id' => $m->winner_id,
                'winner' => $m->winner ? ['id' => $m->winner->id, 'name' => $m->winner->name] : null,
            ])->values())
            ->values()
            ->toArray();
    }
}
