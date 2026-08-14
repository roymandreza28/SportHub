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

        if ($tournament->format === 'round_robin') {
            $this->generateRoundRobin($bracket, $playerIds);
        } else {
            $this->generateSingleElimination($bracket, $playerIds);
        }

        $bracket->update(['structure' => $this->buildStructure($bracket)]);

        $bracket = $bracket->fresh();
        BracketUpdated::dispatch($bracket);

        $this->notifyParticipants($tournament, "The bracket for {$tournament->name} is set — check your matchup!");

        return $bracket;
    }

    protected function generateRoundRobin(Bracket $bracket, Collection $playerIds): void
    {
        for ($i = 0; $i < $playerIds->count(); $i++) {
            for ($j = $i + 1; $j < $playerIds->count(); $j++) {
                $bracket->matches()->create([
                    'round' => 1,
                    'participant_a_id' => $playerIds[$i],
                    'participant_b_id' => $playerIds[$j],
                    'status' => 'scheduled',
                ]);
            }
        }
    }

    protected function generateSingleElimination(Bracket $bracket, Collection $playerIds): void
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
                'round' => 1,
                'participant_a_id' => $a,
                'participant_b_id' => $b,
                'status' => $isBye ? 'completed' : 'scheduled',
                'winner_id' => $winnerId,
            ]);

            if ($isBye && $winnerId) {
                $completedByeMatches[] = $match;
            }
        }

        for ($round = 2; $round <= $totalRounds; $round++) {
            $matchesThisRound = $roundCount / (2 ** ($round - 1));
            for ($i = 0; $i < $matchesThisRound; $i++) {
                $bracket->matches()->create(['round' => $round, 'status' => 'scheduled']);
            }
        }

        foreach ($completedByeMatches as $match) {
            $this->advanceWinner($match);
        }
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

        if ($tournament->format !== 'single_elimination') {
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
