<?php

namespace App\Http\Controllers;

use App\Models\Venue;
use Illuminate\Http\Request;

class VenueController extends Controller
{
    public function index(Request $request)
    {
        return Venue::query()
            ->with(['courts.sport', 'equipment'])
            ->when($request->string('sport_id')->toString(), fn ($q, $sportId) => $q
                ->whereHas('courts', fn ($cq) => $cq->where('sport_id', $sportId)))
            ->when($request->string('search')->toString(), fn ($q, $search) => $q
                ->where('name', 'ilike', "%{$search}%"))
            ->orderBy('name')
            ->get();
    }

    public function show(Venue $venue)
    {
        return $venue->load(['courts.sport', 'equipment', 'facilitator:id,name,email']);
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
        ]);

        $venue = $request->user()->venues()->create($data);

        return response()->json($venue, 201);
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
            ->with(['user:id,name,email', 'court:id,name'])
            ->orderBy('starts_at')
            ->get()
            ->map(fn ($registration) => [
                'id' => $registration->id,
                'title' => $registration->user->name.' - '.($registration->court->name ?? 'Venue'),
                'start' => $registration->starts_at,
                'end' => $registration->ends_at,
                'resourceId' => $registration->court_id,
                'status' => $registration->status,
                'purpose' => $registration->purpose,
                'user' => $registration->user,
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
