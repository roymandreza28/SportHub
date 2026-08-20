<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

// Wipes every table's DATA except user accounts (users + the Spatie
// permission tables that make their roles work) and the Sports/SportFormat
// reference list the app can't function without — everything else (every
// tournament, team, match, stat sheet, player stat, venue/court/booking,
// news post, chat message, notification, friendship, social post, skill
// level, and player profile) is truncated. Built for resetting a demo/live
// deployment back to "accounts exist, nothing has happened yet" without
// touching who can log in.
class ResetToFreshAccountsOnly extends Command
{
    protected $signature = 'system:reset-keep-accounts {--force : Skip the confirmation prompt}';

    protected $description = "Truncate every table except users/roles/permissions/sports — resets the system to a fresh state while keeping every account able to log in";

    // Laravel/infra tables and the ones we deliberately keep — never touched.
    private const KEEP_TABLES = [
        'migrations', 'cache', 'cache_locks', 'jobs', 'job_batches', 'failed_jobs',
        'sessions', 'password_reset_tokens',
        'users', 'roles', 'permissions', 'model_has_roles', 'model_has_permissions', 'role_has_permissions',
        'sports', 'sport_formats',
    ];

    public function handle(): int
    {
        $allTables = collect(DB::select(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
        ))->pluck('tablename');

        $tablesToClear = $allTables->reject(fn ($t) => in_array($t, self::KEEP_TABLES, true))->values();

        if ($tablesToClear->isEmpty()) {
            $this->info('Nothing to clear.');

            return self::SUCCESS;
        }

        if (! $this->option('force') && ! $this->confirm(
            'This will permanently delete '.$tablesToClear->count().' tables\' worth of data ('.$tablesToClear->implode(', ').'). Continue?'
        )) {
            $this->warn('Aborted.');

            return self::FAILURE;
        }

        DB::statement('TRUNCATE TABLE '.$tablesToClear->implode(', ').' RESTART IDENTITY CASCADE');

        $this->info('Cleared '.$tablesToClear->count().' tables. Accounts, roles, and sports/formats were left untouched.');

        return self::SUCCESS;
    }
}
