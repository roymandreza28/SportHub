<?php

namespace App\Policies;

use App\Models\Tournament;
use App\Models\User;

class TournamentPolicy
{
    public function create(User $user): bool
    {
        return $user->can('manage tournaments');
    }

    public function update(User $user, Tournament $tournament): bool
    {
        return $user->can('manage tournaments') && $tournament->organizer_id === $user->id;
    }

    public function delete(User $user, Tournament $tournament): bool
    {
        return $this->update($user, $tournament);
    }

    public function generateBracket(User $user, Tournament $tournament): bool
    {
        return $this->update($user, $tournament);
    }
}
