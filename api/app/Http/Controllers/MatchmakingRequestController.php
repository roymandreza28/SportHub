<?php

namespace App\Http\Controllers;

use App\Events\MatchmakingPairFound;
use App\Models\MatchmakingMatch;
use App\Models\MatchmakingRequest;
use App\Models\Sport;
use App\Models\SportFormat;
use App\Models\Team;
use App\Models\Venue;
use App\Services\MatchmakingCleanupService;
use App\Services\NotificationService;
use App\Services\VenueBookingService;
use App\Support\Broadcasting;
use Carbon\Carbon;
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
                ->with('venueRegistration:id,venue_id,status,starts_at,ends_at')
                ->first();

            if ($match) {
                $opponentRequestId = $match->request_a_id === $mmr->id ? $match->request_b_id : $match->request_a_id;
                $opponentRequest = MatchmakingRequest::with(['user:id,name,email', 'team.members.user:id,name,email'])
                    ->find($opponentRequestId);
                $mmr->opponent = $opponentRequest?->user;
                $mmr->opponent_team = $opponentRequest?->team;

                // The down-payment prompt on the frontend keys off this —
                // present only when the pair's chosen venue+time actually
                // got auto-reserved (see store()'s VenueBookingService call).
                if ($match->venueRegistration) {
                    $conversation = $match->venueRegistration->conversation()->first(['conversations.id']);
                    $mmr->venue_registration = [
                        'id' => $match->venueRegistration->id,
                        'status' => $match->venueRegistration->status,
                        'starts_at' => $match->venueRegistration->starts_at,
                        'ends_at' => $match->venueRegistration->ends_at,
                        'conversation_id' => $conversation?->id,
                    ];
                }
            }
        });

        return $requests;
    }

    public function store(Request $request)
    {
        $this->authorize('create', MatchmakingRequest::class);

        abort_if(
            $request->user()->verification_status !== 'verified',
            403,
            "Your account is still under verification. You can't join or create a match yet."
        );

        $data = $request->validate([
            'sport_id' => ['required', 'exists:sports,id'],
            'sport_format_id' => ['required', 'exists:sport_formats,id'],
            'team_id' => ['nullable', 'exists:teams,id'],
            'venue_id' => ['nullable', 'exists:venues,id'],
            // Booking a specific venue means booking a specific slot — both
            // ends of it are required the moment a venue is named, not
            // optional extras. The 3-hour floor (not just "in the future")
            // gives the venue facilitator real lead time to see and approve
            // the auto-reservation store() creates below before it starts.
            'preferred_start_at' => [
                'nullable', 'date', 'required_with:venue_id',
                function ($attribute, $value, $fail) {
                    if ($value && Carbon::parse($value)->lt(now()->addHours(3))) {
                        $fail('The match must be at least 3 hours from now.');
                    }
                },
            ],
            'preferred_end_at' => ['nullable', 'date', 'after:preferred_start_at', 'required_with:venue_id'],
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
                $match = MatchmakingMatch::create([
                    'request_a_id' => $candidate->id,
                    'request_b_id' => $mine->id,
                    'matched_at' => now(),
                ]);
                $candidate->update(['status' => 'matched']);
                $mine->update(['status' => 'matched']);

                // Whichever side actually named a venue+time is the one
                // whose preference gets auto-reserved — "join" mode never
                // sets these, and a "create" mode request matched against
                // an open-to-anywhere candidate is the common case. If
                // reservation fails (slot taken in the race between this
                // request and the one it matched against, venue since
                // closed, etc.) the pair still stands — see
                // VenueBookingService::reserve()'s own doc comment for why
                // that's a soft failure here, not an aborted request.
                $booker = $mine->venue_id ? $mine : ($candidate->venue_id ? $candidate : null);
                $registration = null;

                if ($booker && ($venue = Venue::find($booker->venue_id))) {
                    $registration = VenueBookingService::reserve(
                        $venue, null, $booker->preferred_start_at, $booker->preferred_end_at, $booker->user_id
                    );

                    if ($registration) {
                        $match->update(['venue_registration_id' => $registration->id]);
                        VenueBookingService::ensureBookingConversation($registration);
                    }
                }

                Broadcasting::safely(fn () => MatchmakingPairFound::dispatch($candidate->fresh(), $mine->fresh()));

                $sportName = Sport::find($data['sport_id'])?->name;

                NotificationService::send($candidate->user_id, 'matchmaking_paired', [
                    'matchmaking_request_id' => $candidate->id,
                    'opponent_id' => $user->id,
                    'opponent_name' => $user->name,
                    'sport_name' => $sportName,
                ]);

                NotificationService::send($user, 'matchmaking_paired', [
                    'matchmaking_request_id' => $mine->id,
                    'opponent_id' => $candidate->user_id,
                    'opponent_name' => $candidate->user->name,
                    'sport_name' => $sportName,
                ]);

                // A separate notification (rather than folding this into
                // matchmaking_paired above) so the frontend can show the
                // "pay a down payment" prompt distinctly from the plain
                // "you've been matched" one, and so a match with no venue
                // preference never gets an empty/irrelevant prompt.
                if ($registration) {
                    $venueName = $registration->venue->name;

                    foreach ([$candidate->user_id, $user->id] as $notifyUserId) {
                        NotificationService::send($notifyUserId, 'matchmaking_venue_reserved', [
                            'matchmaking_request_id' => $notifyUserId === $user->id ? $mine->id : $candidate->id,
                            'venue_registration_id' => $registration->id,
                            'venue_name' => $venueName,
                            'starts_at' => $registration->starts_at,
                        ]);
                    }
                }
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
