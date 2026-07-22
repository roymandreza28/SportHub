<?php

namespace App\Http\Controllers;

use App\Models\GameMatch;
use App\Models\MatchEvent;
use App\Services\BracketService;
use Illuminate\Http\Request;

class MatchController extends Controller
{
    public function updateScore(Request $request, GameMatch $match, BracketService $bracketService)
    {
        $this->authorize('updateScore', $match);

        $data = $request->validate([
            'score_a' => ['required', 'integer', 'min:0'],
            'score_b' => ['required', 'integer', 'min:0'],
            'status' => ['sometimes', 'in:scheduled,live,completed'],
        ]);

        $match->update($data);

        MatchEvent::create([
            'match_id' => $match->id,
            'type' => 'point',
            'payload' => ['score_a' => $match->score_a, 'score_b' => $match->score_b],
        ]);

        if (($data['status'] ?? null) === 'completed') {
            $winnerId = match (true) {
                $match->score_a > $match->score_b => $match->participant_a_id,
                $match->score_b > $match->score_a => $match->participant_b_id,
                default => null,
            };

            $match->update(['winner_id' => $winnerId]);

            if ($winnerId) {
                $bracketService->advanceWinner($match->fresh());
            }
        }

        return $match->fresh(['participantA:id,name', 'participantB:id,name', 'winner:id,name']);
    }
}
