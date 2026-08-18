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

        // Scoring is the assigned venue organizer's job alone — not the main
        // organizer's, even for a tournament they created themselves. Every
        // tournament requires a venue organizer at creation (see
        // TournamentController::store()), so there's no "nobody can score
        // it" gap this would otherwise open up.
        return $gameMatch->bracket->tournament->venue_organizer_id === $user->id;
    }
}
