<?php

namespace App\Http\Controllers;

use App\Events\MatchmakingPairFound;
use App\Models\MatchmakingMatch;
use App\Models\MatchmakingRequest;
use App\Models\SportFormat;
use App\Models\Team;
use App\Services\MatchmakingCleanupService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MatchmakingRequestController extends Controller
{
    public function mine(Request $request)
    {
        // Opportunistic cleanup: no scheduler process is guaranteed to be
        // running, so sweep stale/completed requests whenever a player
        // checks their own list rather than relying solely on cron.
        MatchmakingCleanupService::run();

        $requests = MatchmakingRequest::where('user_id', $request->user()->id)
            ->with(['sport', 'venue', 'sportFormat', 'team.members.user:id,name,email'])
            ->orderByDesc('created_at')
            ->get();

        $requests->each(function (MatchmakingRequest $mmr) {
            $match = MatchmakingMatch::where('request_a_id', $mmr->id)
                ->orWhere('request_b_id', $mmr->id)
                ->first();

            if ($match) {
                $opponentRequestId = $match->request_a_id === $mmr->id ? $match->request_b_id : $match->request_a_id;
                $opponentRequest = MatchmakingRequest::with(['user:id,name,email', 'team.members.user:id,name,email'])
                    ->find($opponentRequestId);
                $mmr->opponent = $opponentRequest?->user;
                $mmr->opponent_team = $opponentRequest?->team;
            }
        });

        return $requests;
    }

    public function store(Request $request)
    {
        $this->authorize('create', MatchmakingRequest::class);

        $data = $request->validate([
            'sport_id' => ['required', 'exists:sports,id'],
            'sport_format_id' => ['required', 'exists:sport_formats,id'],
            'team_id' => ['nullable', 'exists:teams,id'],
            'venue_id' => ['nullable', 'exists:venues,id'],
            'preferred_start_at' => ['nullable', 'date', 'after:now'],
            'preferred_end_at' => ['nullable', 'date', 'after:preferred_start_at'],
        ]);

        $user = $request->user();

        $format = SportFormat::findOrFail($data['sport_format_id']);
        abort_unless($format->sport_id === (int) $data['sport_id'], 422, 'That format does not belong to the selected sport.');

        $team = null;

        if ($format->players_per_side > 1) {
            abort_unless(isset($data['team_id']), 422, 'This format requires a full team — create or select a ready team first.');

            $team = Team::findOrFail($data['team_id']);
            abort_unless($team->captain_id === $user->id, 403, 'Only the team captain can start matchmaking for this team.');
            abort_unless($team->sport_format_id === $format->id, 422, 'That team was not formed for this format.');
            abort_unless($team->status === 'ready', 422, 'Your team needs a full roster before you can match.');
            abort_if(
                MatchmakingRequest::where('team_id', $team->id)->whereIn('status', ['open', 'matched'])->exists(),
                422,
                'This team already has an active matchmaking request.'
            );
        } else {
            // Solo formats never carry a team, even if one was passed.
            $data['team_id'] = null;
        }

        return DB::transaction(function () use ($data, $format, $team, $user) {
            $skillLevel = $user->playerProfile
                ?->skillLevels()->where('sport_id', $data['sport_id'])->first();

            $mine = MatchmakingRequest::create([
                ...$data,
                'user_id' => $user->id,
                'skill_level_id' => $skillLevel?->id,
                'status' => 'open',
            ]);

            $candidate = MatchmakingRequest::where('sport_id', $data['sport_id'])
                ->where('sport_format_id', $format->id)
                ->where('status', 'open')
                ->where('user_id', '!=', $user->id)
                // Same skill tier for this sport — including "both unassessed",
                // so brand-new players aren't blocked from matching each other
                // just because neither has a coach evaluation yet. Compared by
                // the tier value itself (not skill_level_id), since every
                // player has their own SkillLevel row even at the same tier.
                // For team requests this is the captain's own skill level,
                // used as a stand-in for the team's overall level.
                ->when(
                    $skillLevel,
                    fn ($q, $level) => $q->whereHas('skillLevel', fn ($q2) => $q2->where('level', $level->level)),
                    fn ($q) => $q->whereNull('skill_level_id'),
                )
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

                MatchmakingPairFound::dispatch($candidate->fresh(), $mine->fresh());
            }

            return response()->json($mine->fresh(['sport', 'venue', 'sportFormat', 'team.members.user:id,name,email']), 201);
        });
    }

    public function destroy(Request $request, MatchmakingRequest $matchmakingRequest)
    {
        $this->authorize('delete', $matchmakingRequest);

        $matchmakingRequest->update(['status' => 'cancelled']);

        return response()->noContent();
    }
}
