<?php

namespace App\Support;

use App\Models\Team;
use App\Models\User;

class MatchParticipants
{
    /**
     * Normalizes a match's participant/winner field to the same
     * {id, name, image_url} shape regardless of whether the underlying
     * entity is a Team (team tournament, image_url = its logo) or a User
     * (individual tournament, image_url = their avatar) — the one place
     * that knows about both, so every consumer (BracketView, all 4
     * scoreboards, the newsfeed's match card) can keep reading plain
     * participant_a/participant_b/winner unchanged. Callers must eager-load
     * logo_path/avatar_path alongside id/name or image_url silently comes
     * back null (see NewsController::MATCH_RELATION and its siblings).
     */
    public static function shape(?int $teamId, ?Team $team, ?User $user): ?array
    {
        if ($teamId) {
            return $team ? ['id' => $team->id, 'name' => $team->name, 'image_url' => $team->logo_url] : null;
        }

        return $user ? ['id' => $user->id, 'name' => $user->name, 'image_url' => $user->avatar_url] : null;
    }
}
