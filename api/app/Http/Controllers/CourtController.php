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
            'sport_ids' => ['nullable', 'array'],
            'sport_ids.*' => ['integer', 'exists:sports,id'],
            'type' => ['required', 'in:court,field,pool'],
            'capacity' => ['nullable', 'integer', 'min:1'],
            'status' => ['sometimes', 'in:active,maintenance'],
        ]);

        $sportIds = $data['sport_ids'] ?? [];
        unset($data['sport_ids']);

        $court = $venue->courts()->create($data);
        $court->sports()->sync($sportIds);

        return response()->json($court->fresh('sports'), 201);
    }

    public function update(Request $request, Court $court)
    {
        $this->authorize('manageCourts', $court->venue);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'sport_ids' => ['sometimes', 'array'],
            'sport_ids.*' => ['integer', 'exists:sports,id'],
            'type' => ['sometimes', 'in:court,field,pool'],
            'capacity' => ['nullable', 'integer', 'min:1'],
            'status' => ['sometimes', 'in:active,maintenance'],
        ]);

        $sportIds = $data['sport_ids'] ?? null;
        unset($data['sport_ids']);

        $court->update($data);

        if ($sportIds !== null) {
            $court->sports()->sync($sportIds);
        }

        return $court->fresh('sports');
    }

    public function destroy(Court $court)
    {
        $this->authorize('manageCourts', $court->venue);

        $court->delete();

        return response()->noContent();
    }
}
