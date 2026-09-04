<?php

namespace App\Services;

use App\Models\MatchmakingMatch;
use App\Models\MatchmakingRequest;
use Illuminate\Support\Facades\DB;

class MatchmakingCleanupService
{
    // An open request with no preferred time and nobody to pair it with
    // shouldn't linger forever.
    private const OPEN_REQUEST_TTL_HOURS = 24;

    // A matched pair with no explicit meetup time is assumed to have played
    // (or moved on) a few hours after they were paired.
    private const MATCHED_GRACE_HOURS = 3;

    // A paired match's auto-reserved slot that the venue facilitator still
    // hasn't approved or rejected this close to its start time leaves the
    // players with nowhere to actually play — cancel it outright instead of
    // leaving them waiting on a reservation that may never be confirmed.
    private const RESERVATION_RESPONSE_DEADLINE_HOURS = 1;

    /**
     * Expires stale open requests and removes matchmaking records once
     * their matchmaking is done — either the pair's meetup time has passed,
     * or an open request's preferred window (or a reasonable default TTL)
     * has elapsed without anyone joining it. Also fails any pairing whose
     * venue reservation is about to start with still no facilitator
     * response.
     */
    public static function run(): void
    {
        DB::transaction(function () {
            static::cancelUnrespondedReservations();
            static::removeStaleOpenRequests();
            static::removeCompletedMatches();
        });
    }

    private static function cancelUnrespondedReservations(): void
    {
        MatchmakingMatch::query()
            ->whereHas('venueRegistration', function ($query) {
                $query->where('status', 'pending')
                    ->where('starts_at', '<=', now()->addHours(self::RESERVATION_RESPONSE_DEADLINE_HOURS));
            })
            ->with(['venueRegistration.venue', 'requestA', 'requestB'])
            ->get()
            ->each(function (MatchmakingMatch $match) {
                $registration = $match->venueRegistration;
                $registration->update(['status' => 'cancelled']);

                foreach ([$match->requestA, $match->requestB] as $request) {
                    if (! $request) {
                        continue;
                    }

                    $request->update(['status' => 'failed']);

                    NotificationService::send($request->user, 'matchmaking_reservation_expired', [
                        'matchmaking_request_id' => $request->id,
                        'venue_name' => $registration->venue->name,
                        'starts_at' => $registration->starts_at,
                    ]);
                }
            });
    }

    private static function removeStaleOpenRequests(): void
    {
        MatchmakingRequest::where('status', 'open')
            ->where(function ($query) {
                $query->where(function ($q) {
                    $q->whereNotNull('preferred_start_at')->where('preferred_start_at', '<', now());
                })->orWhere(function ($q) {
                    $q->whereNull('preferred_start_at')
                        ->where('created_at', '<', now()->subHours(self::OPEN_REQUEST_TTL_HOURS));
                });
            })
            ->delete();
    }

    private static function removeCompletedMatches(): void
    {
        MatchmakingMatch::with(['requestA', 'requestB'])->get()->each(function (MatchmakingMatch $match) {
            $a = $match->requestA;
            $b = $match->requestB;

            $meetupEndsAt = collect([
                $a?->preferred_end_at,
                $a?->preferred_start_at,
                $b?->preferred_end_at,
                $b?->preferred_start_at,
            ])->filter()->max();

            $expiresAt = $meetupEndsAt ?? $match->matched_at->copy()->addHours(self::MATCHED_GRACE_HOURS);

            if ($expiresAt->isPast()) {
                $match->delete();
                $a?->delete();
                $b?->delete();
            }
        });
    }
}
