<?php

namespace App\Services;

use App\Events\NotificationCreated;
use App\Models\Notification;
use App\Models\User;
use App\Support\Broadcasting;

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

        // ShouldBroadcastNow pushes to Reverb synchronously, inline with the
        // request. If Reverb is unreachable (asleep on Render's free tier,
        // or just not running locally), that would otherwise take down the
        // whole request — even though the notification row (and whatever
        // action triggered it, e.g. a tournament registration) already
        // committed successfully. A missed live push isn't worth failing on.
        Broadcasting::safely(fn () => NotificationCreated::dispatch($notification));

        return $notification;
    }
}
