<?php

namespace App\Console\Commands;

use App\Services\BookingConversationCleanupService;
use Illuminate\Console\Command;

class CleanupBookingConversations extends Command
{
    protected $signature = 'booking-chat:cleanup';

    protected $description = 'Soft-delete booking-triggered conversations whose booking day has ended';

    public function handle(): int
    {
        BookingConversationCleanupService::run();

        $this->info('Booking conversation cleanup complete.');

        return self::SUCCESS;
    }
}
