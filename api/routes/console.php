<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Note: no scheduler process runs in production today (see docs/DEPLOYMENT.md
// — only `web` and `reverb` services exist). This registration makes the
// cleanup correct for local dev (`php artisan schedule:work`) and for
// whenever a scheduler process is added; MatchmakingRequestController@mine
// also calls the same cleanup opportunistically so stale records don't
// depend solely on a cron process existing.
Schedule::command('matchmaking:cleanup')->everyFiveMinutes();

// Same rationale as above: VenueRegistrationController@mine and
// Social\ConversationController@index also call this opportunistically.
Schedule::command('booking-chat:cleanup')->everyFiveMinutes();
