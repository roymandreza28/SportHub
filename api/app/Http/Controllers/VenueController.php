<?php

namespace App\Http\Controllers;

use App\Events\SystemMetricUpdated;
use App\Models\Venue;
use App\Support\Broadcasting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class VenueController extends Controller
{
    public function index(Request $request)
    {
        return Venue::query()
            ->where('status', 'active')
            ->with(['courts.sports', 'equipment'])
            ->when($request->string('sport_id')->toString(), fn ($q, $sportId) => $q
                ->whereHas('courts.sports', fn ($sq) => $sq->where('sports.id', $sportId)))
            ->when($request->string('search')->toString(), fn ($q, $search) => $q
                ->where('name', 'ilike', "%{$search}%"))
            ->orderBy('name')
            ->get();
    }

    public function mine(Request $request)
    {
        // Unlike index(), this is the facilitator's own management view —
        // every venue they own regardless of status, so an inactive venue
        // (hidden from players) is still visible here to be edited/reactivated.
        return $request->user()->venues()
            ->with(['courts.sports', 'equipment'])
            ->withCount([
                'venueRegistrations',
                'venueRegistrations as pending_bookings_count' => fn ($q) => $q->where('status', 'pending'),
            ])
            ->orderBy('name')
            ->get();
    }

    public function show(Venue $venue)
    {
        return $venue->load(['courts.sports', 'equipment', 'facilitator:id,name,email']);
    }

    public function store(Request $request)
    {
        $this->authorize('create', Venue::class);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'address' => ['required', 'string', 'max:255'],
            'latitude' => ['required', 'numeric', 'between:-90,90'],
            'longitude' => ['required', 'numeric', 'between:-180,180'],
            'description' => ['nullable', 'string'],
            'amenities' => ['nullable', 'array'],
            'opens_at' => ['nullable', 'date_format:H:i', 'required_with:closes_at'],
            'closes_at' => ['nullable', 'date_format:H:i', 'after:opens_at', 'required_with:opens_at'],
            'price_per_hour' => ['nullable', 'numeric', 'min:0'],
            'courts' => ['nullable', 'array'],
            'courts.*.name' => ['nullable', 'string', 'max:255'],
            // Each entry is one physical court and the sport(s) it supports —
            // a court can carry more than one (e.g. a tennis court also
            // lined for pickleball), so this is a list, not a single id.
            'courts.*.sport_ids' => ['nullable', 'array'],
            'courts.*.sport_ids.*' => ['integer', 'exists:sports,id'],
            'equipment' => ['nullable', 'array'],
            'equipment.*.name' => ['required', 'string', 'max:255'],
            'equipment.*.quantity' => ['required', 'integer', 'min:1'],
        ]);

        $courts = $data['courts'] ?? [];
        $equipment = $data['equipment'] ?? [];
        unset($data['courts'], $data['equipment']);

        $venue = DB::transaction(function () use ($request, $data, $courts, $equipment) {
            $venue = $request->user()->venues()->create($data);

            // Courts the facilitator adds at creation time (each with its
            // own name and sport(s)) become the venue's initial courts —
            // the same courts.sports pivot every other sport-filtered venue
            // query relies on (player directory, matchmaking venue picker).
            // Finer-grained changes later still go through the courts manager.
            foreach ($courts as $i => $entry) {
                $court = $venue->courts()->create([
                    'name' => ($entry['name'] ?? null) ?: 'Court '.($i + 1),
                    'type' => 'court',
                ]);
                $court->sports()->sync($entry['sport_ids'] ?? []);
            }

            foreach ($equipment as $item) {
                $venue->equipment()->create([
                    'name' => $item['name'],
                    'quantity_total' => $item['quantity'],
                    'quantity_available' => $item['quantity'],
                ]);
            }

            return $venue;
        });

        Broadcasting::safely(fn () => SystemMetricUpdated::dispatch('total_venues', Venue::count()));

        return response()->json($venue->fresh(['courts.sports', 'equipment']), 201);
    }

    public function update(Request $request, Venue $venue)
    {
        $this->authorize('update', $venue);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'address' => ['sometimes', 'string', 'max:255'],
            'latitude' => ['sometimes', 'numeric', 'between:-90,90'],
            'longitude' => ['sometimes', 'numeric', 'between:-180,180'],
            'description' => ['nullable', 'string'],
            'amenities' => ['nullable', 'array'],
            'opens_at' => ['nullable', 'date_format:H:i', 'required_with:closes_at'],
            'closes_at' => ['nullable', 'date_format:H:i', 'after:opens_at', 'required_with:opens_at'],
            'price_per_hour' => ['nullable', 'numeric', 'min:0'],
            'status' => ['sometimes', 'in:active,inactive'],
        ]);

        $venue->update($data);

        return $venue;
    }

    public function destroy(Request $request, Venue $venue)
    {
        $this->authorize('delete', $venue);

        $venue->delete();

        return response()->noContent();
    }

    public function schedule(Venue $venue)
    {
        $this->authorize('viewSchedule', $venue);

        return $venue->venueRegistrations()
            ->with(['user:id,name,email', 'court:id,name', 'conversation:id,venue_registration_id'])
            ->orderBy('starts_at')
            ->get()
            ->map(fn ($registration) => [
                'id' => $registration->id,
                'title' => ($registration->user->name ?? $registration->walk_in_name ?? 'Walk-in').' - '.($registration->court->name ?? 'Venue'),
                'start' => $registration->starts_at,
                'end' => $registration->ends_at,
                'resourceId' => $registration->court_id,
                'status' => $registration->status,
                'purpose' => $registration->purpose,
                'user' => $registration->user,
                'walk_in_name' => $registration->walk_in_name,
                'is_walk_in' => is_null($registration->user_id),
                'conversation_id' => $registration->conversation?->id,
            ]);
    }

    public function availability(Venue $venue)
    {
        return $venue->venueRegistrations()
            ->whereIn('status', ['pending', 'approved'])
            ->orderBy('starts_at')
            ->get(['id', 'court_id', 'starts_at', 'ends_at'])
            ->map(fn ($registration) => [
                'id' => $registration->id,
                'title' => 'Booked',
                'start' => $registration->starts_at,
                'end' => $registration->ends_at,
                'resourceId' => $registration->court_id,
            ]);
    }
}
