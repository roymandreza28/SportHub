<?php

namespace App\Http\Controllers;

use App\Models\VenueRegistration;
use Illuminate\Http\Request;

class VenueRegistrationController extends Controller
{
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
