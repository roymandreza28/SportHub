<?php

namespace App\Policies;

use App\Models\User;
use App\Models\VenueRegistration;

class VenueRegistrationPolicy
{
    public function create(User $user): bool
    {
        return $user->can('create venue registration');
    }

    /**
     * Determine whether the user can approve/reject the registration.
     */
    public function update(User $user, VenueRegistration $venueRegistration): bool
    {
        return $user->can('manage venue registrations')
            && $venueRegistration->venue->facilitator_id === $user->id;
    }
}
