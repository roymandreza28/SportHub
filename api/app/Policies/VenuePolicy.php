<?php

namespace App\Policies;

use App\Models\User;
use App\Models\Venue;

class VenuePolicy
{
    public function create(User $user): bool
    {
        return $user->can('manage venues');
    }

    public function update(User $user, Venue $venue): bool
    {
        return $user->can('manage venues') && $venue->facilitator_id === $user->id;
    }

    public function delete(User $user, Venue $venue): bool
    {
        return $this->update($user, $venue);
    }

    public function manageCourts(User $user, Venue $venue): bool
    {
        return $user->can('manage courts') && $venue->facilitator_id === $user->id;
    }

    public function manageEquipment(User $user, Venue $venue): bool
    {
        return $user->can('manage equipment') && $venue->facilitator_id === $user->id;
    }

    public function viewSchedule(User $user, Venue $venue): bool
    {
        return $venue->facilitator_id === $user->id;
    }
}
