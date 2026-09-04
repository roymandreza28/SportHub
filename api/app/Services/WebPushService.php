<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\PushSubscription;
use App\Models\User;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;

// Delivers a Notification to every device the recipient has subscribed for
// push on — the mechanism that makes it show up in the phone/desktop's own
// notification tray (via the browser's Service Worker) instead of only the
// in-app bell (HeaderNotificationsMenu), which only updates while the tab is
// actually open. VAPID-authenticated Web Push, not a native push service
// (APNs/FCM app credentials) — this app has no native mobile client, so
// there's nothing to register with those. Works today in every desktop
// browser and in Chrome/Firefox on Android; on iOS, Safari only grants push
// permission to a site that's been "Added to Home Screen" first — an Apple
// platform restriction, not something this service can route around.
class WebPushService
{
    // Mirrors HeaderNotificationsMenu.tsx's notificationText() switch on the
    // frontend — kept in sync by hand since the two run in different
    // languages and there was no clean way to share one source of truth.
    // If you add a notification type there, add its wording here too, or
    // this branch just falls through to the generic default.
    private static function present(Notification $notification): string
    {
        $data = $notification->data;

        return match ($notification->type) {
            'friend_request' => "{$data['requester_name']} sent you a friend request",
            'friend_request_accepted' => "{$data['addressee_name']} accepted your friend request",
            'booking_approved' => "Your booking at {$data['venue_name']} was approved",
            'matchmaking_paired' => "You've been matched with {$data['opponent_name']}",
            'matchmaking_venue_reserved' => "Slot reserved at {$data['venue_name']} — pay a down payment to confirm",
            'matchmaking_reservation_expired' => "Your match's reservation at {$data['venue_name']} wasn't confirmed in time and has been cancelled",
            'tournament_update' => $data['message'] ?? 'Tournament update',
            'tournament_assigned' => "You've been assigned to {$data['tournament_name']}",
            'public_inquiry_received' => "New inquiry ({$data['topic']}) from {$data['inquirer_email']}",
            'tournament_champion_crowned' => ($data['champion_name'] ?? 'A champion')." won {$data['tournament_name']}!",
            'team_invite' => "{$data['captain_name']} invited you to join \"{$data['team_name']}\"",
            'account_pending_verification', 'account_verified', 'account_rejected' => $data['message'] ?? 'Account update',
            default => 'New notification',
        };
    }

    public static function sendToUser(User $user, Notification $notification): void
    {
        $subscriptions = $user->pushSubscriptions;
        if ($subscriptions->isEmpty()) {
            return;
        }

        if (! config('services.webpush.public_key') || ! config('services.webpush.private_key')) {
            return;
        }

        $webPush = new WebPush([
            'VAPID' => [
                'subject' => config('services.webpush.subject'),
                'publicKey' => config('services.webpush.public_key'),
                'privateKey' => config('services.webpush.private_key'),
            ],
        ]);

        $payload = json_encode([
            'title' => 'SportHub',
            'body' => self::present($notification),
            'url' => '/dashboard',
        ]);

        foreach ($subscriptions as $subscription) {
            $webPush->queueNotification(
                Subscription::create([
                    'endpoint' => $subscription->endpoint,
                    'publicKey' => $subscription->public_key,
                    'authToken' => $subscription->auth_token,
                ]),
                $payload
            );
        }

        // A subscription the push service reports as gone (unsubscribed on
        // that device, browser data cleared, endpoint rotated) is deleted
        // here rather than left to fail the same way on every future
        // notification — same cleanup-on-bounce idea as an email bounce
        // handler.
        foreach ($webPush->flush() as $report) {
            if (! $report->isSuccess() && $report->isSubscriptionExpired()) {
                PushSubscription::where('endpoint', $report->getEndpoint())->delete();
            }
        }
    }
}
