<?php

namespace App\Console\Commands;

use App\Services\MatchmakingCleanupService;
use Illuminate\Console\Command;

class CleanupMatchmakingRequests extends Command
{
    protected $signature = 'matchmaking:cleanup';

    protected $description = 'Remove matchmaking requests whose meetup time has passed, or that have gone stale unmatched';

    public function handle(): int
    {
        MatchmakingCleanupService::run();

        $this->info('Matchmaking cleanup complete.');

        return self::SUCCESS;
    }
}
