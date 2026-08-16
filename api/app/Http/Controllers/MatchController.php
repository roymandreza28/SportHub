<?php

namespace App\Http\Controllers;

use App\Events\MatchEventCreated;
use App\Events\MatchStatusChanged;
use App\Models\GameMatch;
use App\Models\MatchEvent;
use App\Models\Tournament;
use App\Services\BracketService;
use Illuminate\Http\Request;

class MatchController extends Controller
{
    public function updateScore(Request $request, GameMatch $match, BracketService $bracketService)
    {
        $this->authorize('updateScore', $match);

        $tournament = $match->bracket->tournament;

        if ($tournament->scoring_type === 'best_of_sets') {
            return $this->updateSetsScore($request, $match, $tournament, $bracketService);
        }

        $data = $request->validate([
            'score_a' => ['required', 'integer', 'min:0'],
            'score_b' => ['required', 'integer', 'min:0'],
            'status' => ['sometimes', 'in:scheduled,live,completed'],
        ]);

        $match->update($data);

        $matchEvent = MatchEvent::create([
            'match_id' => $match->id,
            'type' => 'point',
            'payload' => ['score_a' => $match->score_a, 'score_b' => $match->score_b],
        ]);

        MatchEventCreated::dispatch($matchEvent);

        if (($data['status'] ?? null) === 'completed') {
            $winnerId = match (true) {
                $match->score_a > $match->score_b => $match->participant_a_id,
                $match->score_b > $match->score_a => $match->participant_b_id,
                default => null,
            };

            $match->update(['winner_id' => $winnerId]);

            // Always run, even on a tie (no winner): group_stage needs this
            // to know a group's matches are all done and start the knockout
            // stage regardless of whether every result had a clear winner.
            $bracketService->advanceWinner($match->fresh());
        }

        MatchStatusChanged::dispatch($match->fresh());

        return $match->fresh(['participantA:id,name', 'participantB:id,name', 'winner:id,name']);
    }

    // Table tennis's "Best of 5/7 Sets" and volleyball's "Best of Series" —
    // score_a/score_b on the match hold SETS WON (not points), derived here
    // from the full submitted set list, so every existing consumer (the
    // bracket card, the champion banner) keeps working unchanged for both
    // scoring types. The match completes itself once either side reaches
    // the tournament's sets_to_win, rather than the organizer marking it
    // completed by hand.
    private function updateSetsScore(Request $request, GameMatch $match, Tournament $tournament, BracketService $bracketService)
    {
        $data = $request->validate([
            'sets' => ['required', 'array', 'min:1'],
            'sets.*.score_a' => ['required', 'integer', 'min:0'],
            'sets.*.score_b' => ['required', 'integer', 'min:0'],
        ]);

        $setsWonA = collect($data['sets'])->filter(fn ($s) => $s['score_a'] > $s['score_b'])->count();
        $setsWonB = collect($data['sets'])->filter(fn ($s) => $s['score_b'] > $s['score_a'])->count();
        $isDecided = $setsWonA >= $tournament->sets_to_win || $setsWonB >= $tournament->sets_to_win;

        $match->update([
            'sets' => $data['sets'],
            'score_a' => $setsWonA,
            'score_b' => $setsWonB,
            'status' => $isDecided ? 'completed' : 'live',
            'winner_id' => $isDecided ? ($setsWonA > $setsWonB ? $match->participant_a_id : $match->participant_b_id) : null,
        ]);

        $matchEvent = MatchEvent::create([
            'match_id' => $match->id,
            'type' => 'point',
            'payload' => ['score_a' => $setsWonA, 'score_b' => $setsWonB, 'sets' => $data['sets']],
        ]);

        MatchEventCreated::dispatch($matchEvent);

        if ($isDecided) {
            $bracketService->advanceWinner($match->fresh());
        }

        MatchStatusChanged::dispatch($match->fresh());

        return $match->fresh(['participantA:id,name', 'participantB:id,name', 'winner:id,name']);
    }
}
