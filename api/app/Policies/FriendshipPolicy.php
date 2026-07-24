<?php

namespace App\Policies;

use App\Models\Friendship;
use App\Models\User;

class FriendshipPolicy
{
    public function create(User $user): bool
    {
        return $user->can('manage friendships');
    }

    public function respond(User $user, Friendship $friendship): bool
    {
        return $friendship->addressee_id === $user->id && $friendship->status === 'pending';
    }

    public function delete(User $user, Friendship $friendship): bool
    {
        return in_array($user->id, [$friendship->requester_id, $friendship->addressee_id], true);
    }
}
