<?php

namespace App\Policies;

use App\Models\User;
use App\Models\VenueRegistration;

class VenueRegistrationPolicy
{
    /**
     * Determine whether the user can approve/reject the registration.
     * (Player-side creation is authorized separately when that endpoint is built.)
     */
    public function update(User $user, VenueRegistration $venueRegistration): bool
    {
        return $user->can('manage venue registrations')
            && $venueRegistration->venue->facilitator_id === $user->id;
    }
}
