<?php

namespace App\Support;

use Throwable;

class Broadcasting
{
    /**
     * Wraps a ShouldBroadcastNow event dispatch so a broadcaster outage
     * (Reverb asleep on a free host tier, or just not running locally)
     * can't take down a request whose underlying database work already
     * succeeded — same rationale as NotificationService::send().
     */
    public static function safely(callable $dispatch): void
    {
        try {
            $dispatch();
        } catch (Throwable $e) {
            report($e);
        }
    }
}
