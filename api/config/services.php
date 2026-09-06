<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    // Web Push (browser/device notifications) — VAPID identifies this
    // server to push services (FCM, Mozilla's push service, etc.) without
    // needing a per-platform API key the way native push (APNs/FCM app
    // credentials) would. Generated once via
    // Minishlink\WebPush\VAPID::createVapidKeys() — regenerating these
    // invalidates every existing subscription (every device would need to
    // re-subscribe), so treat them as a long-lived secret, not something to
    // rotate casually.
    'webpush' => [
        'public_key' => env('VAPID_PUBLIC_KEY'),
        'private_key' => env('VAPID_PRIVATE_KEY'),
        'subject' => env('VAPID_SUBJECT', 'mailto:admin@sporthub.test'),
    ],

    // Seed-time only — NewsfeedSeeder searches Pexels for a real, accurately
    // tagged photo per sport rather than trusting an untagged/mistagged
    // source. Free tier, no card required: pexels.com/api.
    'pexels' => [
        'key' => env('PEXELS_API_KEY'),
    ],

];
