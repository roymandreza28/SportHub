<?php

namespace App\Policies;

use App\Models\User;

class TournamentRegistrationPolicy
{
    public function create(User $user): bool
    {
        return $user->can('create tournament registration');
    }
}
