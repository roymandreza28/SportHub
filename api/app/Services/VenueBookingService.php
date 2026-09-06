<?php

namespace App\Services;

use App\Models\Conversation;
use App\Models\Court;
use App\Models\Venue;
use App\Models\VenueRegistration;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

// Shared by VenueRegistrationController (a player booking a court directly)
// and MatchmakingRequestController (auto-reserving the slot a matched pair
// asked for) — both need the exact same "is this slot actually available"
// checks, and both need the same facilitator-conversation bootstrap once a
// booking exists, so neither is allowed to drift into its own copy.
class VenueBookingService
{
    // Returns null (rather than throwing) on any conflict — the matchmaking
    // call site treats "couldn't reserve" as "pair the players anyway, just
    // without an auto-booked slot" rather than a hard failure, since a race
    // against another booking shouldn't block two players from being
    // matched. VenueRegistrationController's own direct-booking endpoint
    // still does its own validation with real error messages for the
    // player filling out that form; this is the best-effort variant.
    public static function reserve(Venue $venue, ?int $courtId, string|Carbon $startsAt, string|Carbon $endsAt, int $userId): ?VenueRegistration
    {
        if ($venue->status !== 'active') {
            return null;
        }

        if ($venue->opens_at && $venue->closes_at) {
            // Facilitators set operating hours as Asia/Manila wall-clock
            // time; starts_at/ends_at arrive as UTC instants, so convert
            // before comparing — mirrors VenueRegistrationController::store().
            $startTime = Carbon::parse($startsAt)->timezone('Asia/Manila')->format('H:i:s');
            $endTime = Carbon::parse($endsAt)->timezone('Asia/Manila')->format('H:i:s');

            if ($startTime < $venue->opens_at || $endTime > $venue->closes_at) {
                return null;
            }
        }

        if (VenueRegistration::hasOverlap($venue->id, $courtId, $startsAt, $endsAt)) {
            return null;
        }

        $court = $courtId ? Court::find($courtId) : null;
        $hours = Carbon::parse($startsAt)->diffInMinutes(Carbon::parse($endsAt), true) / 60;

        // Same rule VenueRegistrationController::store() enforces with a real
        // validation error for a player filling out that form directly — a
        // block-priced court (e.g. BRCC's badminton gymnasium, ₱1,500 for an
        // exact 3-hour block) has no valid price for a duration that isn't a
        // whole multiple of the block length, so there's nothing correct to
        // auto-reserve here. Soft-fails like every other check above rather
        // than throwing, for the same reason: the pair still stands even
        // without an auto-booked slot.
        if ($court?->block_hours) {
            $remainder = fmod(round($hours, 4), $court->block_hours);
            if ($remainder > 0.001 && $remainder < $court->block_hours - 0.001) {
                return null;
            }
        }

        $registration = VenueRegistration::create([
            'venue_id' => $venue->id,
            'court_id' => $courtId,
            'user_id' => $userId,
            'starts_at' => $startsAt,
            'ends_at' => $endsAt,
            'status' => 'pending',
        ]);

        $registration->setAttribute('total_amount', self::calculateTotalAmount($venue, $court, $hours));

        return $registration;
    }

    // The one place a booking's price is computed — shared by
    // VenueRegistrationController::store() (a player booking directly, court
    // chosen by hand) and reserve() above (matchmaking's auto-booking, court
    // resolved by sport) so the two can never drift into different answers
    // for the same court. A block-priced court (fixed length, fixed price)
    // takes priority over the venue's flat hourly rate whenever it applies;
    // null means neither is published, not that the venue is free.
    public static function calculateTotalAmount(Venue $venue, ?Court $court, float $hours): ?float
    {
        return match (true) {
            $court?->block_hours && $court->block_price !== null => round(($hours / $court->block_hours) * $court->block_price, 2),
            (bool) $venue->price_per_hour => round($hours * $venue->price_per_hour, 2),
            default => null,
        };
    }

    // The player/coach who booked and the venue's facilitator can only talk
    // through this thread — created directly (not through Social\
    // ConversationController::store()) precisely because that endpoint
    // requires the two users to already be friends, and a facilitator and a
    // one-off booker usually aren't. Called both once a booking is approved
    // (VenueRegistrationController::update()) AND the instant a matchmaking
    // pair auto-reserves a slot (MatchmakingRequestController::store()) —
    // the latter is deliberately available *before* approval, so the two
    // players can coordinate a down payment with the facilitator while the
    // booking is still pending, not just after.
    public static function ensureBookingConversation(VenueRegistration $registration): Conversation
    {
        return DB::transaction(function () use ($registration) {
            $conversation = Conversation::firstOrCreate(
                ['venue_registration_id' => $registration->id],
                ['type' => 'direct', 'created_by' => $registration->venue->facilitator_id]
            );

            if ($conversation->wasRecentlyCreated) {
                $conversation->participants()->attach([$registration->user_id, $registration->venue->facilitator_id]);
            }

            return $conversation;
        });
    }
}
