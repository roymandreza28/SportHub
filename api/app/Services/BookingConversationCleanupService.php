<?php

namespace App\Services;

use App\Models\Conversation;
use Illuminate\Support\Facades\DB;

class BookingConversationCleanupService
{
    /**
     * Soft-deletes every booking-triggered conversation whose booking's day
     * (in Asia/Manila wall-clock time, the municipality this app serves) has
     * ended — the player/coach and facilitator only need to talk about that
     * specific day's booking, not indefinitely afterward.
     */
    public static function run(): void
    {
        DB::transaction(function () {
            Conversation::query()
                ->whereNotNull('venue_registration_id')
                ->with('venueRegistration')
                ->get()
                ->each(function (Conversation $conversation) {
                    $registration = $conversation->venueRegistration;

                    if (! $registration || $registration->ends_at->timezone('Asia/Manila')->endOfDay()->isPast()) {
                        $conversation->delete();
                    }
                });
        });
    }
}
