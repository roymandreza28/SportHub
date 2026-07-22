<?php

namespace App\Http\Controllers;

use App\Models\MatchmakingMatch;
use App\Models\MatchmakingRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MatchmakingRequestController extends Controller
{
    public function mine(Request $request)
    {
        $requests = MatchmakingRequest::where('user_id', $request->user()->id)
            ->with('sport')
            ->orderByDesc('created_at')
            ->get();

        $requests->each(function (MatchmakingRequest $mmr) {
            $match = MatchmakingMatch::where('request_a_id', $mmr->id)
                ->orWhere('request_b_id', $mmr->id)
                ->first();

            if ($match) {
                $opponentRequestId = $match->request_a_id === $mmr->id ? $match->request_b_id : $match->request_a_id;
                $mmr->opponent = MatchmakingRequest::with('user:id,name,email')->find($opponentRequestId)?->user;
            }
        });

        return $requests;
    }

    public function store(Request $request)
    {
        $this->authorize('create', MatchmakingRequest::class);

        $data = $request->validate([
            'sport_id' => ['required', 'exists:sports,id'],
            'venue_id' => ['nullable', 'exists:venues,id'],
            'preferred_start_at' => ['nullable', 'date', 'after:now'],
            'preferred_end_at' => ['nullable', 'date', 'after:preferred_start_at'],
        ]);

        $user = $request->user();

        return DB::transaction(function () use ($data, $user) {
            $skillLevelId = $user->playerProfile
                ?->skillLevels()->where('sport_id', $data['sport_id'])->value('id');

            $mine = MatchmakingRequest::create([
                ...$data,
                'user_id' => $user->id,
                'skill_level_id' => $skillLevelId,
                'status' => 'open',
            ]);

            $candidate = MatchmakingRequest::where('sport_id', $data['sport_id'])
                ->where('status', 'open')
                ->where('user_id', '!=', $user->id)
                ->when($data['venue_id'] ?? null, fn ($q, $venueId) => $q
                    ->where(fn ($q2) => $q2->whereNull('venue_id')->orWhere('venue_id', $venueId)))
                ->orderBy('created_at')
                ->lockForUpdate()
                ->first();

            if ($candidate) {
                MatchmakingMatch::create([
                    'request_a_id' => $candidate->id,
                    'request_b_id' => $mine->id,
                    'matched_at' => now(),
                ]);
                $candidate->update(['status' => 'matched']);
                $mine->update(['status' => 'matched']);
            }

            return response()->json($mine->fresh('sport'), 201);
        });
    }

    public function destroy(Request $request, MatchmakingRequest $matchmakingRequest)
    {
        $this->authorize('delete', $matchmakingRequest);

        $matchmakingRequest->update(['status' => 'cancelled']);

        return response()->noContent();
    }
}
