<?php

namespace App\Http\Controllers;

use App\Models\Court;
use App\Models\Venue;
use Illuminate\Http\Request;

class CourtController extends Controller
{
    public function store(Request $request, Venue $venue)
    {
        $this->authorize('manageCourts', $venue);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'sport_id' => ['nullable', 'exists:sports,id'],
            'type' => ['required', 'in:court,field,pool'],
            'capacity' => ['nullable', 'integer', 'min:1'],
            'status' => ['sometimes', 'in:active,maintenance'],
        ]);

        $court = $venue->courts()->create($data);

        return response()->json($court, 201);
    }

    public function update(Request $request, Court $court)
    {
        $this->authorize('manageCourts', $court->venue);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'sport_id' => ['nullable', 'exists:sports,id'],
            'type' => ['sometimes', 'in:court,field,pool'],
            'capacity' => ['nullable', 'integer', 'min:1'],
            'status' => ['sometimes', 'in:active,maintenance'],
        ]);

        $court->update($data);

        return $court;
    }

    public function destroy(Court $court)
    {
        $this->authorize('manageCourts', $court->venue);

        $court->delete();

        return response()->noContent();
    }
}
