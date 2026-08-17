<?php

namespace App\Support;

use App\Models\Team;
use App\Models\User;

class MatchParticipants
{
    /**
     * Normalizes a match's participant/winner field to the same {id, name}
     * shape regardless of whether the underlying entity is a Team (team
     * tournament) or a User (individual tournament) — the one place that
     * knows about both, so every consumer (BracketView, all 4 scoreboards)
     * can keep reading plain participant_a/participant_b/winner unchanged.
     */
    public static function shape(?int $teamId, ?Team $team, ?User $user): ?array
    {
        if ($teamId) {
            return $team ? ['id' => $team->id, 'name' => $team->name] : null;
        }

        return $user ? ['id' => $user->id, 'name' => $user->name] : null;
    }
}
