<?php

namespace App\Http\Controllers;

use App\Models\Court;
use App\Models\VenueRegistration;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class VenueRegistrationController extends Controller
{
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

        return response()->json($registration->load('venue:id,name', 'court:id,name'), 201);
    }

    public function update(Request $request, VenueRegistration $venueRegistration)
    {
        $this->authorize('update', $venueRegistration);

        $data = $request->validate([
            'status' => ['required', 'in:approved,rejected'],
        ]);

        $venueRegistration->update($data);

        return $venueRegistration->load('user:id,name,email', 'court:id,name');
    }
}
