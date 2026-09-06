<?php

namespace App\Http\Controllers;

use App\Events\VenueRegistrationUpdated;
use App\Models\Court;
use App\Models\Venue;
use App\Models\VenueRegistration;
use App\Services\BookingConversationCleanupService;
use App\Services\NotificationService;
use App\Services\VenueBookingService;
use App\Support\Broadcasting;
use Carbon\Carbon;
use Illuminate\Http\Request;
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
                'venue' => fn ($q) => $q->withTrashed()->select('id', 'name', 'address', 'latitude', 'longitude'),
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
            'purpose' => ['required', 'string', 'max:255'],
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

        $court = null;

        if (! empty($data['court_id'])) {
            $court = Court::findOrFail($data['court_id']);
            if ($court->venue_id !== (int) $data['venue_id']) {
                throw ValidationException::withMessages(['court_id' => ['This court does not belong to the selected venue.']]);
            }
        }

        $hours = Carbon::parse($data['starts_at'])->diffInMinutes(Carbon::parse($data['ends_at']), true) / 60;

        // Some courts (e.g. BRCC's badminton gymnasium) aren't rented by the
        // hour at all — they're sold in a fixed-length, fixed-price block
        // (₱1,500 for exactly 3 hours). A booking that isn't an exact
        // multiple of that block length has no valid price under this
        // court's real rate sheet, so it's rejected outright rather than
        // silently rounded or charged pro-rata.
        if ($court?->block_hours) {
            // Guard against float drift (e.g. 2.9999999997 hours from a
            // sub-second-off selection) with a small epsilon before the
            // modulo check.
            $remainder = fmod(round($hours, 4), $court->block_hours);
            if ($remainder > 0.001 && $remainder < $court->block_hours - 0.001) {
                throw ValidationException::withMessages([
                    'ends_at' => ["Bookings for {$court->name} must be in {$court->block_hours}-hour blocks (e.g. {$court->block_hours}, ".(2 * $court->block_hours).", ".(3 * $court->block_hours).' hours).'],
                ]);
            }
        }

        if (VenueRegistration::hasOverlap((int) $data['venue_id'], $data['court_id'] ?? null, $data['starts_at'], $data['ends_at'])) {
            throw ValidationException::withMessages(['starts_at' => ['This slot is already booked or pending for that time range.']]);
        }

        $registration = $request->user()->venueRegistrations()->create([
            ...$data,
            'status' => 'pending',
        ]);

        Broadcasting::safely(fn () => VenueRegistrationUpdated::dispatch($registration));

        // Same principle as the matchmaking auto-reservation flow: the
        // conversation exists the instant a request is made, not only once
        // the facilitator approves it, so the booker can coordinate (and
        // send a down-payment screenshot) with the facilitator right away.
        // BookingConversationCleanupService sweeps it once the booking's
        // day has passed, regardless of whether it was ever approved.
        $conversation = VenueBookingService::ensureBookingConversation($registration);

        $venue->loadMissing('facilitator:id,name,phone');

        $totalAmount = VenueBookingService::calculateTotalAmount($venue, $court, $hours);

        $registration->load('venue:id,name', 'court:id,name');
        $registration->setAttribute('total_amount', $totalAmount);
        $registration->setAttribute('facilitator_name', $venue->facilitator->name);
        $registration->setAttribute('facilitator_phone', $venue->facilitator->phone);
        $registration->setAttribute('conversation_id', $conversation->id);

        return response()->json($registration, 201);
    }

    // A facilitator logging a walk-in customer who isn't using the app —
    // created already `approved` (the facilitator creating it *is* the
    // approval) so it blocks the slot immediately against both future
    // walk-ins and in-app bookings via the same hasOverlap() check store()
    // uses.
    public function storeManual(Request $request, Venue $venue)
    {
        $this->authorize('createManualBooking', $venue);

        $data = $request->validate([
            'court_id' => ['nullable', 'exists:courts,id'],
            'starts_at' => ['required', 'date'],
            'ends_at' => ['required', 'date', 'after:starts_at'],
            'walk_in_name' => ['required', 'string', 'max:255'],
            'walk_in_contact' => ['nullable', 'string', 'max:255'],
            'purpose' => ['nullable', 'string', 'max:255'],
        ]);

        abort_if($venue->status !== 'active', 422, 'This venue is currently closed and not accepting bookings.');

        if (! empty($data['court_id'])) {
            $court = Court::findOrFail($data['court_id']);
            if ($court->venue_id !== $venue->id) {
                throw ValidationException::withMessages(['court_id' => ['This court does not belong to this venue.']]);
            }
        }

        if ($venue->opens_at && $venue->closes_at) {
            $startTime = Carbon::parse($data['starts_at'])->timezone('Asia/Manila')->format('H:i:s');
            $endTime = Carbon::parse($data['ends_at'])->timezone('Asia/Manila')->format('H:i:s');

            if ($startTime < $venue->opens_at || $endTime > $venue->closes_at) {
                throw ValidationException::withMessages([
                    'starts_at' => ["This venue is only open from {$venue->opens_at} to {$venue->closes_at}."],
                ]);
            }
        }

        if (VenueRegistration::hasOverlap($venue->id, $data['court_id'] ?? null, $data['starts_at'], $data['ends_at'])) {
            throw ValidationException::withMessages(['starts_at' => ['This slot is already booked or pending for that time range.']]);
        }

        $registration = $venue->venueRegistrations()->create([
            'court_id' => $data['court_id'] ?? null,
            'starts_at' => $data['starts_at'],
            'ends_at' => $data['ends_at'],
            'walk_in_name' => $data['walk_in_name'],
            'walk_in_contact' => $data['walk_in_contact'] ?? null,
            'purpose' => $data['purpose'] ?? null,
            'status' => 'approved',
            'user_id' => null,
        ]);

        Broadcasting::safely(fn () => VenueRegistrationUpdated::dispatch($registration));

        return response()->json($registration->load('court:id,name'), 201);
    }

    public function update(Request $request, VenueRegistration $venueRegistration)
    {
        $this->authorize('update', $venueRegistration);

        $data = $request->validate([
            'status' => ['required', 'in:approved,rejected'],
        ]);

        $venueRegistration->update($data);

        // A manual/walk-in booking is created already-approved and has no
        // linked user — nothing to message or notify.
        if ($data['status'] === 'approved' && $venueRegistration->user_id !== null) {
            VenueBookingService::ensureBookingConversation($venueRegistration);

            NotificationService::send($venueRegistration->user_id, 'booking_approved', [
                'venue_registration_id' => $venueRegistration->id,
                'venue_id' => $venueRegistration->venue->id,
                'venue_name' => $venueRegistration->venue->name,
                'starts_at' => $venueRegistration->starts_at,
            ]);
        }

        Broadcasting::safely(fn () => VenueRegistrationUpdated::dispatch($venueRegistration->fresh()));

        return $venueRegistration->load('user:id,name,email', 'court:id,name', 'conversation:id,venue_registration_id');
    }
}
