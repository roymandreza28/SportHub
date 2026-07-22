<?php

namespace App\Policies;

use App\Models\News;
use App\Models\User;

class NewsPolicy
{
    public function create(User $user): bool
    {
        return $user->can('manage news');
    }

    public function update(User $user, News $news): bool
    {
        return $user->can('manage news') && $news->author_id === $user->id;
    }

    public function delete(User $user, News $news): bool
    {
        return $this->update($user, $news);
    }
}
