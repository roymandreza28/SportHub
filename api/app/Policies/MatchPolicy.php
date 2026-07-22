<?php

namespace App\Policies;

use App\Models\GameMatch;
use App\Models\User;

class MatchPolicy
{
    public function updateScore(User $user, GameMatch $gameMatch): bool
    {
        return $user->can('update match score')
            && $gameMatch->bracket->tournament->organizer_id === $user->id;
    }
}
