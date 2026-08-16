<?php

namespace App\Policies;

use App\Models\GameMatch;
use App\Models\User;

class MatchPolicy
{
    public function updateScore(User $user, GameMatch $gameMatch): bool
    {
        if (! $user->can('update match score')) {
            return false;
        }

        // A venue organizer runs the scoreboard for whichever tournament
        // the main organizer assigned them to — not any tournament.
        return $gameMatch->bracket->tournament->organizer_id === $user->id
            || $gameMatch->bracket->tournament->venue_organizer_id === $user->id;
    }
}
