<?php

namespace App\Policies;

use App\Models\NewsReaction;
use App\Models\User;

class NewsReactionPolicy
{
    public function create(User $user): bool
    {
        return $user->can('interact with news');
    }
}
