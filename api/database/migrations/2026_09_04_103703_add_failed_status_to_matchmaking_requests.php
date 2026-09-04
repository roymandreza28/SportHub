<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// Postgres compiles Laravel's enum() column to a CHECK constraint, not a
// native enum type, so widening the allowed values means dropping and
// re-adding that constraint by hand — there's no portable schema-builder
// helper for it. Adds 'failed': the status MatchmakingCleanupService now
// sets on both sides of a paired match whose auto-reserved venue slot
// still hadn't been approved or rejected by the time it was about to start.
return new class extends Migration
{
    private const OLD_VALUES = ['open', 'matched', 'expired', 'cancelled'];

    private const NEW_VALUES = ['open', 'matched', 'expired', 'cancelled', 'failed'];

    public function up(): void
    {
        DB::statement('ALTER TABLE matchmaking_requests DROP CONSTRAINT matchmaking_requests_status_check');
        DB::statement(
            'ALTER TABLE matchmaking_requests ADD CONSTRAINT matchmaking_requests_status_check '.
            "CHECK (status IN ('".implode("','", self::NEW_VALUES)."'))"
        );
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE matchmaking_requests DROP CONSTRAINT matchmaking_requests_status_check');
        DB::statement(
            'ALTER TABLE matchmaking_requests ADD CONSTRAINT matchmaking_requests_status_check '.
            "CHECK (status IN ('".implode("','", self::OLD_VALUES)."'))"
        );
    }
};
