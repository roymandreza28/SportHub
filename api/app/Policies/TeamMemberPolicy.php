<?php

namespace App\Policies;

use App\Models\TeamMember;
use App\Models\User;

class TeamMemberPolicy
{
    public function respond(User $user, TeamMember $teamMember): bool
    {
        return $teamMember->user_id === $user->id && $teamMember->status === 'invited';
    }

    public function remove(User $user, TeamMember $teamMember): bool
    {
        return $teamMember->user_id === $user->id || $teamMember->team->captain_id === $user->id;
    }
}
