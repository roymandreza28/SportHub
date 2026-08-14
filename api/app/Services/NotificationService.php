<?php

namespace App\Services;

use App\Events\NotificationCreated;
use App\Models\Notification;
use App\Models\User;

class NotificationService
{
    /**
     * Creates a notification for one user and broadcasts it live on their
     * own App.Models.User.{id} channel — the same channel already used for
     * FriendRequestSent/Accepted, so this is a drop-in extension of that
     * convention rather than a new one.
     */
    public static function send(User|int $user, string $type, array $data): Notification
    {
        $notification = Notification::create([
            'user_id' => $user instanceof User ? $user->id : $user,
            'type' => $type,
            'data' => $data,
        ]);

        NotificationCreated::dispatch($notification);

        return $notification;
    }
}
