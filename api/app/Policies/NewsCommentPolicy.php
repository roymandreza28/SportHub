<?php

namespace App\Policies;

use App\Models\NewsComment;
use App\Models\User;

class NewsCommentPolicy
{
    public function create(User $user): bool
    {
        return $user->can('interact with news');
    }

    public function delete(User $user, NewsComment $newsComment): bool
    {
        return $newsComment->user_id === $user->id;
    }
}
