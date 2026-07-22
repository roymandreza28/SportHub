<?php

namespace App\Policies;

use App\Models\Livestream;
use App\Models\User;

class LivestreamPolicy
{
    public function create(User $user): bool
    {
        return $user->can('manage livestreams');
    }

    public function update(User $user, Livestream $livestream): bool
    {
        if (! $user->can('manage livestreams')) {
            return false;
        }

        if ($livestream->tournament_id) {
            return $livestream->tournament->organizer_id === $user->id;
        }

        if ($livestream->news_id) {
            return $livestream->news->author_id === $user->id;
        }

        return false;
    }

    public function delete(User $user, Livestream $livestream): bool
    {
        return $this->update($user, $livestream);
    }
}
