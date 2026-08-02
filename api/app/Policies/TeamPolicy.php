<?php

namespace App\Policies;

use App\Models\Team;
use App\Models\User;

class TeamPolicy
{
    public function create(User $user): bool
    {
        return $user->can('manage teams');
    }

    public function manage(User $user, Team $team): bool
    {
        return $team->captain_id === $user->id;
    }

    public function view(User $user, Team $team): bool
    {
        return $team->captain_id === $user->id || $team->members()->where('user_id', $user->id)->exists();
    }

    public function delete(User $user, Team $team): bool
    {
        return $team->captain_id === $user->id;
    }
}
