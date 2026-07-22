<?php

namespace App\Http\Controllers;

use App\Models\Equipment;
use App\Models\Venue;
use Illuminate\Http\Request;

class EquipmentController extends Controller
{
    public function store(Request $request, Venue $venue)
    {
        $this->authorize('manageEquipment', $venue);

        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'quantity_total' => ['required', 'integer', 'min:0'],
            'quantity_available' => ['required', 'integer', 'min:0', 'lte:quantity_total'],
        ]);

        $equipment = $venue->equipment()->create($data);

        return response()->json($equipment, 201);
    }

    public function update(Request $request, Equipment $equipment)
    {
        $this->authorize('manageEquipment', $equipment->venue);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'quantity_total' => ['sometimes', 'integer', 'min:0'],
            'quantity_available' => ['sometimes', 'integer', 'min:0', 'lte:quantity_total'],
        ]);

        $equipment->update($data);

        return $equipment;
    }

    public function destroy(Equipment $equipment)
    {
        $this->authorize('manageEquipment', $equipment->venue);

        $equipment->delete();

        return response()->noContent();
    }
}
