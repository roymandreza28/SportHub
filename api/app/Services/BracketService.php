<?php

namespace App\Services;

use App\Events\BracketUpdated;
use App\Events\RoundAdvanced;
use App\Models\Bracket;
use App\Models\GameMatch;
use App\Models\Team;
use App\Models\Tournament;
use App\Models\User;
use App\Support\Broadcasting;
use App\Support\MatchParticipants;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class BracketService
{
    // No queue/scheduler infrastructure runs in this app's deployment, so
    // there's no cron ticking down a countdown — instead this runs
    // opportunistically wherever tournaments are listed/read (see
    // TournamentController::index()/bracket()), catching any tournament
    // whose scheduled start time has passed while it was still open for
    // registration and kicking off its bracket automatically. Seeding order
    // is whatever generate() below already does — a shuffle, never
    // registration order — so this doesn't need its own randomization.
    public function autoStartExpired(): void
    {
        Tournament::query()
            ->where('status', 'registration')
            ->where('starts_at', '<=', now())
            ->whereDoesntHave('bracket')
            ->get()
            ->each(function (Tournament $tournament) {
                $registeredCount = $tournament->registrations()->whereIn('status', ['pending', 'confirmed'])->count();

                // Too few registrants to form even one match — still move to
                // preparation rather than leaving this stuck in registration
                // forever (the deadline already passed). No bracket gets
                // generated; the organizer's only real option from here is to
                // cancel, since registration itself is already closed.
                if ($registeredCount < 2) {
                    $tournament->update(['status' => 'preparation']);

                    return;
                }

                $this->generate($tournament);
                $tournament->update(['status' => 'preparation']);
            });
    }

    public function generate(Tournament $tournament): Bracket
    {
        $isTeamTournament = $tournament->sport_format_id !== null;

        $participantIds = $tournament->registrations()
            ->whereIn('status', ['pending', 'confirmed'])
            ->pluck($isTeamTournament ? 'team_id' : 'user_id')
            ->shuffle()
            ->values();

        // If anything below throws (e.g. a malformed participant list), the
        // whole attempt rolls back instead of leaving an empty, structure-
        // less Bracket row behind — a half-created bracket is worse than no
        // bracket, since the UI has no "retry" affordance for it.
        $bracket = DB::transaction(function () use ($tournament, $participantIds, $isTeamTournament) {
            $bracket = $tournament->bracket()->create(['current_round' => 1]);

            match ($tournament->format) {
                'round_robin' => $this->generateRoundRobin($bracket, $participantIds, null, 1, $isTeamTournament),
                'group_stage' => $this->generateGroupStage($bracket, $participantIds, $isTeamTournament),
                'double_elimination' => $this->generateDoubleElimination($bracket, $participantIds, $isTeamTournament),
                'swiss' => $this->generateSwiss($bracket, $participantIds, $isTeamTournament),
                default => $this->generateSingleElimination($bracket, $participantIds, 1, $isTeamTournament),
            };

            $bracket->update(['structure' => $this->buildStructure($bracket)]);

            return $bracket->fresh();
        });
        Broadcasting::safely(fn () => BracketUpdated::dispatch($bracket));

        $this->notifyParticipants($tournament, "The bracket for {$tournament->name} is set — check your matchup!");

        return $bracket;
    }

    // The "circle method" — see circleMethodRounds() below for the actual
    // algorithm. $round is the STARTING round number (group_stage calls this
    // once per group, each starting back at 1 and distinguished from each
    // other purely by $groupNumber, not by round — see generateGroupStage()),
    // so every real round this produces is offset from that starting point.
    protected function generateRoundRobin(Bracket $bracket, Collection $playerIds, ?int $groupNumber = null, int $round = 1, bool $teamMode = false): void
    {
        $aField = $teamMode ? 'participant_a_team_id' : 'participant_a_id';
        $bField = $teamMode ? 'participant_b_team_id' : 'participant_b_id';

        foreach ($this->circleMethodRounds($playerIds->values()->all()) as $offset => $roundPairs) {
            foreach ($roundPairs as [$a, $b]) {
                // A bye slot (odd player count) has nobody real on one side —
                // there's no match to schedule, just a round that player sits
                // out. See circleMethodRounds()'s own comment.
                if ($a === null || $b === null) {
                    continue;
                }

                $bracket->matches()->create([
                    'round' => $round + $offset,
                    'group_number' => $groupNumber,
                    $aField => $a,
                    $bField => $b,
                    'status' => 'scheduled',
                ]);
            }
        }
    }

    /**
     * Arranges all N players around a circle (padding with a null bye to
     * make N even), fixes one player in place, and for each of N-1 rounds
     * pairs whoever's sitting opposite each other before rotating everyone
     * EXCEPT the fixed player by one position. The fixed player cycles past
     * every other player exactly once, and the opposite-pairing rule means
     * the rotating players never repeat a matchup either — so every one of
     * the N(N-1)/2 possible pairs appears exactly once across the whole
     * schedule, by construction, with no lookups or backtracking needed.
     *
     * @param  array<int, int>  $ids
     * @return array<int, array<int, array{0: int|null, 1: int|null}>> N-1 rounds, each a list of [a, b] pairs — a bye is represented as null
     */
    private function circleMethodRounds(array $ids): array
    {
        $arr = $ids;
        if (count($arr) % 2 !== 0) {
            $arr[] = null;
        }
        $n = count($arr);
        $rounds = [];
        $rot = $arr;

        for ($r = 0; $r < $n - 1; $r++) {
            $roundPairs = [];
            for ($i = 0; $i < intdiv($n, 2); $i++) {
                $roundPairs[] = [$rot[$i], $rot[$n - 1 - $i]];
            }
            $rounds[] = $roundPairs;

            $fixed = $rot[0];
            $rest = array_slice($rot, 1);
            array_unshift($rest, array_pop($rest));
            $rot = array_merge([$fixed], $rest);
        }

        return $rounds;
    }

    // ---- Group stage: round-robin pools, then a single-elimination knockout ----

    protected function generateGroupStage(Bracket $bracket, Collection $playerIds, bool $teamMode = false): void
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
            $this->generateRoundRobin($bracket, $members, $groupNumber, 1, $teamMode);
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
    protected function maybeStartGroupKnockout(Bracket $bracket, bool $teamMode = false): void
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

        $standings = $groupMatches->groupBy('group_number')->map(fn (Collection $matches) => $this->rankGroup($matches, $teamMode));

        $ranked1 = $standings->map(fn ($s) => $s->get(0))->filter()->values();
        $ranked2 = $standings->map(fn ($s) => $s->get(1))->filter()->values();

        // Cross-seed so a group's own top 2 don't immediately rematch in
        // round 1 of the knockout: every group winner, then every runner-up
        // in reverse group order.
        $qualifiers = $ranked1->concat($ranked2->reverse()->values())->pluck('id')->values();

        $startRound = $groupMatches->max('round') + 1;

        $this->generateSingleElimination($bracket, $qualifiers, $startRound, $teamMode);
    }

    private function rankGroup(Collection $matches, bool $teamMode = false): Collection
    {
        $aField = $teamMode ? 'participant_a_team_id' : 'participant_a_id';
        $bField = $teamMode ? 'participant_b_team_id' : 'participant_b_id';
        $winnerField = $teamMode ? 'winner_team_id' : 'winner_id';

        $stats = collect();

        foreach ($matches as $match) {
            foreach ([
                [$match->{$aField}, $match->score_a, $match->score_b],
                [$match->{$bField}, $match->score_b, $match->score_a],
            ] as [$playerId, $scoredFor, $scoredAgainst]) {
                if (! $playerId) {
                    continue;
                }

                $entry = $stats->get($playerId, ['id' => $playerId, 'wins' => 0, 'for' => 0, 'against' => 0]);
                $entry['for'] += $scoredFor;
                $entry['against'] += $scoredAgainst;
                if ($match->{$winnerField} === $playerId) {
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

    protected function generateSingleElimination(Bracket $bracket, Collection $playerIds, int $startRound = 1, bool $teamMode = false): void
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

        $aField = $teamMode ? 'participant_a_team_id' : 'participant_a_id';
        $bField = $teamMode ? 'participant_b_team_id' : 'participant_b_id';
        $winnerField = $teamMode ? 'winner_team_id' : 'winner_id';

        $completedByeMatches = [];

        for ($i = 0; $i < $roundCount; $i++) {
            $a = $slots[$i * 2];
            $b = $slots[$i * 2 + 1];
            $isBye = is_null($a) || is_null($b);
            $winnerId = $isBye ? ($a ?? $b) : null;

            $match = $bracket->matches()->create([
                'round' => $startRound,
                $aField => $a,
                $bField => $b,
                'status' => $isBye ? 'completed' : 'scheduled',
                $winnerField => $winnerId,
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

    protected function generateDoubleElimination(Bracket $bracket, Collection $playerIds, bool $teamMode = false): void
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

        $aField = $teamMode ? 'participant_a_team_id' : 'participant_a_id';
        $bField = $teamMode ? 'participant_b_team_id' : 'participant_b_id';
        $winnerField = $teamMode ? 'winner_team_id' : 'winner_id';

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
                $aField => $a,
                $bField => $b,
                'status' => $isBye ? 'completed' : 'scheduled',
                $winnerField => $winnerId,
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

    private function advanceDoubleElimination(GameMatch $match, bool $teamMode = false): void
    {
        $bracket = $match->bracket;
        $tournament = $bracket->tournament;

        match ($match->bracket_type) {
            'winners' => $this->advanceDoubleEliminationWinners($match, $bracket, $tournament, $teamMode),
            'losers' => $this->advanceDoubleEliminationLosers($match, $bracket, $tournament, $teamMode),
            'final' => $this->completeDoubleElimination($tournament),
            default => null,
        };

        $bracket->update(['structure' => $this->buildStructure($bracket)]);
        Broadcasting::safely(fn () => BracketUpdated::dispatch($bracket->fresh()));
    }

    private function completeDoubleElimination(Tournament $tournament): void
    {
        $this->completeTournament($tournament);
    }

    private function advanceDoubleEliminationWinners(GameMatch $match, Bracket $bracket, Tournament $tournament, bool $teamMode = false): void
    {
        $aField = $teamMode ? 'participant_a_team_id' : 'participant_a_id';
        $bField = $teamMode ? 'participant_b_team_id' : 'participant_b_id';
        $winnerField = $teamMode ? 'winner_team_id' : 'winner_id';

        $maxWbRound = $bracket->matches()->where('bracket_type', 'winners')->max('round');
        $roundMatches = $bracket->matches()->where('bracket_type', 'winners')->where('round', $match->round)->orderBy('id')->get();
        $index = $roundMatches->search(fn (GameMatch $m) => $m->id === $match->id);
        $loserId = $match->{$aField} === $match->{$winnerField} ? $match->{$bField} : $match->{$aField};

        if ($match->round < $maxWbRound) {
            $nextRoundMatches = $bracket->matches()->where('bracket_type', 'winners')->where('round', $match->round + 1)->orderBy('id')->get();
            $nextMatch = $nextRoundMatches[intdiv($index, 2)];
            $slot = $index % 2 === 0 ? $aField : $bField;
            $nextMatch->update([$slot => $match->{$winnerField}]);
        } else {
            $final = $bracket->matches()->where('bracket_type', 'final')->first();
            if ($final) {
                $final->update([$aField => $match->{$winnerField}]);
            } else {
                // No losers bracket exists (only 2 entrants total) — the
                // winners-bracket match is decisive on its own.
                $this->completeDoubleElimination($tournament);
            }
        }

        // Byes have no real loser to route anywhere.
        if ($loserId) {
            $this->dropIntoLosersBracket($bracket, $match->round, $index, $loserId, $teamMode);
        }
    }

    private function dropIntoLosersBracket(Bracket $bracket, int $wbRound, int $wbMatchIndex, int $loserId, bool $teamMode = false): void
    {
        $aField = $teamMode ? 'participant_a_team_id' : 'participant_a_id';
        $bField = $teamMode ? 'participant_b_team_id' : 'participant_b_id';
        $winnerField = $teamMode ? 'winner_team_id' : 'winner_id';

        if ($wbRound === 1) {
            $lbRoundOffset = 1;
            $lbPosition = intdiv($wbMatchIndex, 2);
            $slot = $wbMatchIndex % 2 === 0 ? $aField : $bField;
        } else {
            $lbRoundOffset = 2 * ($wbRound - 1);
            $lbPosition = $wbMatchIndex;
            $slot = $bField;
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
            $siblingIsBye = $sibling && (is_null($sibling->{$aField}) || is_null($sibling->{$bField}));

            if ($siblingIsBye) {
                $lbMatch->update(['status' => 'completed', $winnerField => $loserId]);
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
                $lbMatch->update(['status' => 'completed', $winnerField => $loserId]);
                $this->advanceWinner($lbMatch->fresh());
            }
        }
    }

    private function advanceDoubleEliminationLosers(GameMatch $match, Bracket $bracket, Tournament $tournament, bool $teamMode = false): void
    {
        $aField = $teamMode ? 'participant_a_team_id' : 'participant_a_id';
        $bField = $teamMode ? 'participant_b_team_id' : 'participant_b_id';
        $winnerField = $teamMode ? 'winner_team_id' : 'winner_id';

        $lbRound = $match->round - 100;
        $maxLbRound = $bracket->matches()->where('bracket_type', 'losers')->max('round') - 100;

        if ($lbRound >= $maxLbRound) {
            // Losers-bracket final: the winner becomes the LB champion,
            // waiting in the grand final's other slot.
            $final = $bracket->matches()->where('bracket_type', 'final')->first();
            $final?->update([$bField => $match->{$winnerField}]);

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
            $nextMatch?->update([$aField => $match->{$winnerField}]);
        } else {
            // Even round: winners of this round's adjacent positions merge
            // together into the next (odd) round.
            $nextPosition = intdiv($position, 2);
            $slot = $position % 2 === 0 ? $aField : $bField;
            $nextMatch = $bracket->matches()->where('bracket_type', 'losers')
                ->where('round', $nextRound)->where('bracket_position', $nextPosition)->first();
            $nextMatch?->update([$slot => $match->{$winnerField}]);
        }
    }

    // ---- Swiss system ----

    /**
     * A fixed number of rounds (ceil(log2(playerCount)), the standard Swiss
     * convention), no elimination — every round pairs players with similar
     * records so far. Standings after the final round decide the winner.
     */
    protected function generateSwiss(Bracket $bracket, Collection $playerIds, bool $teamMode = false): void
    {
        $this->pairSwissRound($bracket, $playerIds, 1, $teamMode);

        $bField = $teamMode ? 'participant_b_team_id' : 'participant_b_id';
        $byeMatches = $bracket->matches()->where('bracket_type', 'swiss')->where('round', 1)
            ->whereNull($bField)->get();

        foreach ($byeMatches as $match) {
            $this->advanceWinner($match);
        }
    }

    // ceil(log2(N)) is the mathematical minimum — enough rounds that a
    // perfect scorer is guaranteed unique — but one extra round beyond
    // that gives a materially more reliable final ranking, especially once
    // draws are possible: a draw in what would have been the very last
    // round can otherwise leave two players tied for first with no
    // further play left to separate them. See the algorithm reference's
    // own "real events often run a couple of rounds beyond that minimum"
    // note. Skipped for a field of 1 (or 0) — with nobody to actually play
    // an extra round against, it would just be another pointless bye
    // rather than a more reliable ranking.
    private function totalSwissRounds(int $playerCount): int
    {
        if ($playerCount <= 1) {
            return 1;
        }

        return max(1, (int) ceil(log($playerCount, 2))) + 1;
    }

    /**
     * Walks down the given (standings-ordered, or shuffled for round 1)
     * list from the top: takes the highest-remaining player and pairs them
     * with the NEAREST player below them they haven't already played,
     * searching the whole remaining pool rather than stopping at one
     * adjacent swap — this is what actually keeps players grouped with
     * others of similar performance while never repeating a pairing, as
     * long as a fresh opponent exists anywhere in the pool. Only forces a
     * rematch (against whoever's next in line) when the field is small
     * enough relative to the round count that no fresh opponent is left at
     * all — better than leaving someone unpaired. An odd field's bye goes
     * to the lowest-ranked player who hasn't had one yet, so the same
     * player never sits out twice while others never do.
     */
    private function pairSwissRound(Bracket $bracket, Collection $orderedIds, int $round, bool $teamMode = false): void
    {
        $aField = $teamMode ? 'participant_a_team_id' : 'participant_a_id';
        $bField = $teamMode ? 'participant_b_team_id' : 'participant_b_id';
        $winnerField = $teamMode ? 'winner_team_id' : 'winner_id';

        $remaining = $orderedIds->values()->all();
        $pastPairs = $round > 1 ? $this->swissPastPairs($bracket, $teamMode) : collect();
        $priorByes = $round > 1 ? $this->swissPriorByeIds($bracket, $teamMode) : collect();
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

        while (count($remaining) > 0) {
            $p = array_shift($remaining);

            $idx = null;
            foreach ($remaining as $j => $candidate) {
                if (! $pastPairs->contains($this->swissPairKey($p, $candidate))) {
                    $idx = $j;
                    break;
                }
            }
            // No fresh opponent left anywhere in the pool — force a rematch
            // against whoever's next rather than leave $p unpaired.
            $idx ??= 0;

            $opp = $remaining[$idx];
            array_splice($remaining, $idx, 1);
            $pairs[] = [$p, $opp];
        }

        foreach ($pairs as [$a, $b]) {
            $isBye = is_null($b);
            $bracket->matches()->create([
                'round' => $round,
                'bracket_type' => 'swiss',
                $aField => $a,
                $bField => $b,
                'status' => $isBye ? 'completed' : 'scheduled',
                $winnerField => $isBye ? $a : null,
            ]);
        }
    }

    private function swissPairKey(int $a, int $b): string
    {
        return implode('-', [min($a, $b), max($a, $b)]);
    }

    private function swissPastPairs(Bracket $bracket, bool $teamMode = false): Collection
    {
        $aField = $teamMode ? 'participant_a_team_id' : 'participant_a_id';
        $bField = $teamMode ? 'participant_b_team_id' : 'participant_b_id';

        return $bracket->matches()->where('bracket_type', 'swiss')->whereNotNull($bField)->get()
            ->map(fn (GameMatch $m) => $this->swissPairKey($m->{$aField}, $m->{$bField}));
    }

    private function swissPriorByeIds(Bracket $bracket, bool $teamMode = false): Collection
    {
        $aField = $teamMode ? 'participant_a_team_id' : 'participant_a_id';
        $bField = $teamMode ? 'participant_b_team_id' : 'participant_b_id';

        return $bracket->matches()->where('bracket_type', 'swiss')->whereNull($bField)->pluck($aField);
    }

    private function maybeAdvanceSwissRound(Bracket $bracket, Tournament $tournament, bool $teamMode = false): void
    {
        $currentRound = (int) $bracket->matches()->where('bracket_type', 'swiss')->max('round');
        $roundMatches = $bracket->matches()->where('bracket_type', 'swiss')->where('round', $currentRound)->get();

        if ($roundMatches->contains(fn (GameMatch $m) => $m->status !== 'completed')) {
            $bracket->update(['structure' => $this->buildStructure($bracket)]);
            Broadcasting::safely(fn () => BracketUpdated::dispatch($bracket->fresh()));

            return;
        }

        $playerCount = $tournament->registrations()->whereIn('status', ['pending', 'confirmed'])->count();
        $totalRounds = $this->totalSwissRounds($playerCount);

        if ($currentRound >= $totalRounds) {
            $bracket->update(['structure' => $this->buildStructure($bracket)]);
            Broadcasting::safely(fn () => BracketUpdated::dispatch($bracket->fresh()));

            $this->completeTournament($tournament);

            return;
        }

        $standings = collect($this->swissStandings($bracket, $teamMode))->pluck('id');
        $nextRound = $currentRound + 1;
        $this->pairSwissRound($bracket, $standings, $nextRound, $teamMode);

        $bracket->update([
            'current_round' => $nextRound,
            'structure' => $this->buildStructure($bracket),
        ]);

        Broadcasting::safely(fn () => BracketUpdated::dispatch($bracket->fresh()));
        Broadcasting::safely(fn () => RoundAdvanced::dispatch($tournament->id, $nextRound));
        $this->notifyParticipants($tournament, "Round {$nextRound} has started in {$tournament->name}.");

        $bField = $teamMode ? 'participant_b_team_id' : 'participant_b_id';
        $byeMatches = $bracket->matches()->where('bracket_type', 'swiss')->where('round', $nextRound)
            ->whereNull($bField)->get();

        foreach ($byeMatches as $match) {
            $this->advanceWinner($match);
        }
    }

    /**
     * Points first (a win is 1, a draw — a completed match with equal
     * scores and so no winner — is 0.5 each, same as a bye counting as a
     * full win with no real opponent), then point differential, then points
     * scored — same tiebreak chain as group_stage's rankGroup(), applied
     * across every swiss-tagged match played so far. Crediting a draw as
     * half a point rather than nothing matters here specifically because
     * this ranking feeds the NEXT round's pairing — treating a draw as a
     * loss would drop a player who tied a strong opponent down among
     * players who lost outright, defeating the point of pairing by
     * similar performance.
     */
    private function swissStandings(Bracket $bracket, bool $teamMode = false): array
    {
        $aField = $teamMode ? 'participant_a_team_id' : 'participant_a_id';
        $bField = $teamMode ? 'participant_b_team_id' : 'participant_b_id';
        $winnerField = $teamMode ? 'winner_team_id' : 'winner_id';

        $matches = $bracket->matches()->where('bracket_type', 'swiss')->get();
        $stats = [];

        foreach ($matches as $match) {
            foreach ([
                [$match->{$aField}, $match->score_a, $match->score_b],
                [$match->{$bField}, $match->score_b, $match->score_a],
            ] as [$playerId, $scoredFor, $scoredAgainst]) {
                if (! $playerId) {
                    continue;
                }

                $stats[$playerId] ??= ['id' => $playerId, 'points' => 0.0, 'for' => 0, 'against' => 0];
                $stats[$playerId]['for'] += $scoredFor;
                $stats[$playerId]['against'] += $scoredAgainst;
                if ($match->{$winnerField} === $playerId) {
                    $stats[$playerId]['points'] += 1;
                } elseif ($match->{$winnerField} === null && $match->status === 'completed') {
                    $stats[$playerId]['points'] += 0.5;
                }
            }
        }

        $stats = array_values($stats);

        usort($stats, fn ($a, $b) => $b['points'] <=> $a['points']
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
        $isTeamTournament = $tournament->sport_format_id !== null;

        if ($tournament->format === 'group_stage' && $match->group_number !== null) {
            $this->maybeStartGroupKnockout($bracket, $isTeamTournament);
            $bracket->update(['structure' => $this->buildStructure($bracket)]);
            Broadcasting::safely(fn () => BracketUpdated::dispatch($bracket->fresh()));

            return;
        }

        if ($tournament->format === 'double_elimination') {
            $this->advanceDoubleElimination($match, $isTeamTournament);

            return;
        }

        if ($tournament->format === 'swiss') {
            $this->maybeAdvanceSwissRound($bracket, $tournament, $isTeamTournament);

            return;
        }

        // Round robin has no bracket to advance (every result only affects
        // one row of a standings table, not a next match — see
        // generateRoundRobin()'s own doc comment) — but the bracket's
        // structure JSON is still a snapshot cached at generation time
        // (buildStructure() only gets called when something explicitly
        // rebuilds it), so without this a completed match's winner would
        // never actually show up in the bracket view: the underlying match
        // row is correct, but the cached blob the frontend actually renders
        // from would keep showing it scheduled forever.
        if ($tournament->format === 'round_robin') {
            $bracket->update(['structure' => $this->buildStructure($bracket)]);
            Broadcasting::safely(fn () => BracketUpdated::dispatch($bracket->fresh()));

            // Every fixture played -> crown a champion, same as every other
            // format does once there's nothing left to play. determineChampion()
            // breaks a tied win count by total score across the whole
            // schedule (see its own doc comment) — the only tiebreak a
            // round robin actually needs, since nobody's eliminated and
            // there's no decisive final match to fall back on.
            if (! $bracket->matches()->where('status', '!=', 'completed')->exists()) {
                $this->completeTournament($tournament);
            }

            return;
        }

        if (! in_array($tournament->format, ['single_elimination', 'group_stage'], true)) {
            return;
        }

        $roundMatches = $bracket->matches()->where('round', $match->round)->orderBy('id')->get();
        $index = $roundMatches->search(fn (GameMatch $m) => $m->id === $match->id);

        $nextRoundMatches = $bracket->matches()->where('round', $match->round + 1)->orderBy('id')->get();

        if ($nextRoundMatches->isEmpty()) {
            $bracket->update(['structure' => $this->buildStructure($bracket)]);
            Broadcasting::safely(fn () => BracketUpdated::dispatch($bracket->fresh()));

            $this->completeTournament($tournament);

            return;
        }

        $nextMatch = $nextRoundMatches[intdiv($index, 2)];
        $slot = match (true) {
            $isTeamTournament && $index % 2 === 0 => 'participant_a_team_id',
            $isTeamTournament => 'participant_b_team_id',
            $index % 2 === 0 => 'participant_a_id',
            default => 'participant_b_id',
        };
        $nextMatch->update([$slot => $isTeamTournament ? $match->winner_team_id : $match->winner_id]);

        $didAdvanceRound = $match->round + 1 > $bracket->current_round;

        $bracket->update([
            'current_round' => max($bracket->current_round, $match->round + 1),
            'structure' => $this->buildStructure($bracket),
        ]);

        Broadcasting::safely(fn () => BracketUpdated::dispatch($bracket->fresh()));

        if ($didAdvanceRound) {
            Broadcasting::safely(fn () => RoundAdvanced::dispatch($tournament->id, $match->round + 1));
            $this->notifyParticipants($tournament, "Round {$nextMatch->round} has started in {$tournament->name}.");
        }
    }

    // Shared by every format's completion path (single/group-stage
    // fallthrough in advanceWinner(), completeDoubleElimination(),
    // maybeAdvanceSwissRound()) — previously each duplicated the same
    // status-flip + notification inline. Persisting a champion and telling
    // the organizer specifically (not just the generic participant blast) is
    // new: nothing in this app tracked a tournament-level winner before.
    private function completeTournament(Tournament $tournament): void
    {
        $champion = $this->determineChampion($tournament);

        $tournament->update([
            'status' => 'completed',
            'champion_id' => $champion['user_id'],
            'champion_team_id' => $champion['team_id'],
        ]);

        $this->notifyParticipants($tournament, "{$tournament->name} has ended — thanks for playing!");

        NotificationService::send($tournament->organizer_id, 'tournament_champion_crowned', [
            'tournament_id' => $tournament->id,
            'tournament_name' => $tournament->name,
            'champion_name' => $champion['name'],
        ]);
    }

    // Most match wins across the whole bracket — for single/double-
    // elimination this always lands on exactly the final's winner (you
    // can't reach the final without winning every prior match), so one
    // formula covers every format without branching on it. Ties are only
    // realistically possible in round_robin/swiss (an elimination bracket's
    // winner always has strictly the most wins by construction) — broken by
    // whoever scored the most points total across every game they played,
    // not an arbitrary id order.
    private function determineChampion(Tournament $tournament): array
    {
        $isTeam = $tournament->sport_format_id !== null;
        $aField = $isTeam ? 'participant_a_team_id' : 'participant_a_id';
        $bField = $isTeam ? 'participant_b_team_id' : 'participant_b_id';

        $wins = [];
        $totalScore = [];

        foreach ($tournament->bracket->matches()->where('status', 'completed')->get() as $match) {
            $winnerId = $isTeam ? $match->winner_team_id : $match->winner_id;
            if ($winnerId !== null) {
                $wins[$winnerId] = ($wins[$winnerId] ?? 0) + 1;
            }

            [$scoreA, $scoreB] = $this->realPointTotals($match, $tournament);

            foreach ([[$match->{$aField}, $scoreA], [$match->{$bField}, $scoreB]] as [$participantId, $score]) {
                if ($participantId !== null) {
                    $totalScore[$participantId] = ($totalScore[$participantId] ?? 0) + $score;
                }
            }
        }

        if (empty($wins)) {
            return ['user_id' => null, 'team_id' => null, 'name' => null];
        }

        $championId = null;
        $bestWins = -1;
        $bestScore = -1;

        foreach ($wins as $id => $winCount) {
            $score = $totalScore[$id] ?? 0;
            if ($winCount > $bestWins || ($winCount === $bestWins && $score > $bestScore)) {
                $championId = $id;
                $bestWins = $winCount;
                $bestScore = $score;
            }
        }

        $champion = $isTeam ? Team::find($championId) : User::find($championId);

        return $isTeam
            ? ['user_id' => null, 'team_id' => $championId, 'name' => $champion?->name]
            : ['user_id' => $championId, 'team_id' => null, 'name' => $champion?->name];
    }

    /**
     * A best_of_sets match's score_a/score_b columns are SETS WON (e.g. a
     * 2-1 badminton match), not real points — using them for "most total
     * points scored" would really just be counting games won a second time.
     * The actual point values live per-set in $match->sets, so this sums
     * those instead whenever they're available. single_score tournaments
     * have no such gap: score_a/score_b already ARE the real points.
     *
     * @return array{0: int, 1: int}
     */
    private function realPointTotals(GameMatch $match, Tournament $tournament): array
    {
        if ($tournament->scoring_type === 'best_of_sets' && ! empty($match->sets)) {
            $totalA = 0;
            $totalB = 0;

            foreach ($match->sets as $set) {
                $totalA += (int) ($set['score_a'] ?? 0);
                $totalB += (int) ($set['score_b'] ?? 0);
            }

            return [$totalA, $totalB];
        }

        return [$match->score_a, $match->score_b];
    }

    // Every registrant gets notified, not just the two players in the match
    // that triggered the advance — "your tournament moved forward" is
    // relevant to the whole field, not just whoever just played. For a team
    // tournament that means every accepted member of every registered team,
    // not just the team's captain.
    public function notifyParticipants(Tournament $tournament, string $message): void
    {
        $userIds = $tournament->sport_format_id !== null
            ? $tournament->registrations()->with('team.members')->get()
                ->flatMap(fn ($registration) => $registration->team
                    ?->members->where('status', 'accepted')->pluck('user_id') ?? collect())
                ->unique()
            : $tournament->registrations()->pluck('user_id')->unique();

        $userIds->each(
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
            // show. Team relations are loaded too so a team match's slots can
            // be normalized to the same {id, name} shape as an individual
            // match's — see MatchParticipants.
            ->with([
                'participantA:id,name', 'participantB:id,name', 'winner:id,name',
                'participantATeam:id,name', 'participantBTeam:id,name', 'winnerTeam:id,name',
            ])
            ->orderBy('round')
            ->orderBy('id')
            ->get()
            ->groupBy('round')
            ->map(fn (Collection $matches) => $matches->map(fn (GameMatch $m) => [
                'id' => $m->id,
                'round' => $m->round,
                'group_number' => $m->group_number,
                'bracket_type' => $m->bracket_type,
                // Only meaningful for double_elimination's losers bracket —
                // BracketView's connector-line drawing needs this to
                // reconstruct exactly which match a loser drops into or a
                // losers-bracket winner advances to, mirroring
                // dropIntoLosersBracket()/advanceDoubleEliminationLosers()'s
                // own position math below.
                'bracket_position' => $m->bracket_position,
                'participant_a_id' => $m->participant_a_id,
                'participant_b_id' => $m->participant_b_id,
                'participant_a' => MatchParticipants::shape($m->participant_a_team_id, $m->participantATeam, $m->participantA),
                'participant_b' => MatchParticipants::shape($m->participant_b_team_id, $m->participantBTeam, $m->participantB),
                'score_a' => $m->score_a,
                'score_b' => $m->score_b,
                'status' => $m->status,
                'winner_id' => $m->winner_id,
                'winner' => MatchParticipants::shape($m->winner_team_id, $m->winnerTeam, $m->winner),
            ])->values())
            ->values()
            ->toArray();
    }
}
