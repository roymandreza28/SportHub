<?php

namespace App\Http\Controllers;

use App\Events\VenueRegistrationUpdated;
use App\Models\Conversation;
use App\Models\Court;
use App\Models\Venue;
use App\Models\VenueRegistration;
use App\Services\BookingConversationCleanupService;
use App\Services\NotificationService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class VenueRegistrationController extends Controller
{
    public function mine(Request $request)
    {
        // withTrashed() — a player's own booking history should still show
        // which venue it was for even if that venue was later soft-deleted;
        // the whole point of a soft delete (vs. a hard one) is that this
        // kind of historical reference doesn't just go blank.
        BookingConversationCleanupService::run();

        return $request->user()->venueRegistrations()
            ->with([
                'venue' => fn ($q) => $q->withTrashed()->select('id', 'name'),
                'court:id,name',
                'conversation:id,venue_registration_id',
            ])
            ->orderByDesc('starts_at')
            ->get();
    }

    public function store(Request $request)
    {
        $this->authorize('create', VenueRegistration::class);

        $data = $request->validate([
            'venue_id' => ['required', 'exists:venues,id'],
            'court_id' => ['nullable', 'exists:courts,id'],
            'starts_at' => ['required', 'date', 'after:now'],
            'ends_at' => ['required', 'date', 'after:starts_at'],
            'purpose' => ['nullable', 'string', 'max:255'],
        ]);

        $venue = Venue::findOrFail($data['venue_id']);

        abort_if($venue->status !== 'active', 422, 'This venue is currently closed and not accepting bookings.');

        if ($venue->opens_at && $venue->closes_at) {
            // Facilitators set operating hours as Asia/Manila wall-clock time
            // (the app serves a single municipality); starts_at/ends_at
            // arrive as UTC instants, so convert before comparing.
            $startTime = Carbon::parse($data['starts_at'])->timezone('Asia/Manila')->format('H:i:s');
            $endTime = Carbon::parse($data['ends_at'])->timezone('Asia/Manila')->format('H:i:s');

            if ($startTime < $venue->opens_at || $endTime > $venue->closes_at) {
                throw ValidationException::withMessages([
                    'starts_at' => ["This venue is only open from {$venue->opens_at} to {$venue->closes_at}."],
                ]);
            }
        }

        if (! empty($data['court_id'])) {
            $court = Court::findOrFail($data['court_id']);
            if ($court->venue_id !== (int) $data['venue_id']) {
                throw ValidationException::withMessages(['court_id' => ['This court does not belong to the selected venue.']]);
            }

            $overlaps = VenueRegistration::where('court_id', $data['court_id'])
                ->whereIn('status', ['pending', 'approved'])
                ->where('starts_at', '<', $data['ends_at'])
                ->where('ends_at', '>', $data['starts_at'])
                ->exists();

            if ($overlaps) {
                throw ValidationException::withMessages(['starts_at' => ['This court is already booked or pending for that time range.']]);
            }
        }

        $registration = $request->user()->venueRegistrations()->create([
            ...$data,
            'status' => 'pending',
        ]);

        VenueRegistrationUpdated::dispatch($registration);

        return response()->json($registration->load('venue:id,name', 'court:id,name'), 201);
    }

    public function update(Request $request, VenueRegistration $venueRegistration)
    {
        $this->authorize('update', $venueRegistration);

        $data = $request->validate([
            'status' => ['required', 'in:approved,rejected'],
        ]);

        $venueRegistration->update($data);

        if ($data['status'] === 'approved') {
            $this->ensureBookingConversation($venueRegistration);

            NotificationService::send($venueRegistration->user_id, 'booking_approved', [
                'venue_registration_id' => $venueRegistration->id,
                'venue_id' => $venueRegistration->venue->id,
                'venue_name' => $venueRegistration->venue->name,
                'starts_at' => $venueRegistration->starts_at,
            ]);
        }

        VenueRegistrationUpdated::dispatch($venueRegistration->fresh());

        return $venueRegistration->load('user:id,name,email', 'court:id,name', 'conversation:id,venue_registration_id');
    }

    // The player/coach who booked and the venue's facilitator can only talk
    // once a booking is approved, and this conversation is created directly
    // (not through Social\ConversationController::store()) precisely because
    // that endpoint requires the two users to already be friends — a
    // facilitator and a one-off booker usually aren't.
    private function ensureBookingConversation(VenueRegistration $registration): void
    {
        DB::transaction(function () use ($registration) {
            $conversation = Conversation::firstOrCreate(
                ['venue_registration_id' => $registration->id],
                ['type' => 'direct', 'created_by' => $registration->venue->facilitator_id]
            );

            if ($conversation->wasRecentlyCreated) {
                $conversation->participants()->attach([$registration->user_id, $registration->venue->facilitator_id]);
            }
        });
    }
}
