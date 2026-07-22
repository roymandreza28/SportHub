<?php

namespace App\Policies;

use App\Models\MatchmakingRequest;
use App\Models\User;

class MatchmakingRequestPolicy
{
    public function create(User $user): bool
    {
        return $user->can('create matchmaking request');
    }

    public function delete(User $user, MatchmakingRequest $matchmakingRequest): bool
    {
        return $matchmakingRequest->user_id === $user->id;
    }
}
