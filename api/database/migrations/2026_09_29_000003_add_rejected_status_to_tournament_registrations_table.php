<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// Postgres compiles Laravel's enum() column to a CHECK constraint, not a
// native enum type, so widening the allowed values means dropping and
// re-adding that constraint by hand — see
// 2026_09_04_103703_add_failed_status_to_matchmaking_requests.php for the
// same pattern. Adds 'rejected': the status an organizer/facilitator now
// sets on a registration that didn't show valid proof of payment (see
// TournamentRegistrationController::updateStatus()) — 'confirmed' is reused
// as the "approved" outcome rather than adding yet another value.
return new class extends Migration
{
    private const OLD_VALUES = ['pending', 'confirmed', 'withdrawn'];

    private const NEW_VALUES = ['pending', 'confirmed', 'withdrawn', 'rejected'];

    public function up(): void
    {
        DB::statement('ALTER TABLE tournament_registrations DROP CONSTRAINT tournament_registrations_status_check');
        DB::statement(
            'ALTER TABLE tournament_registrations ADD CONSTRAINT tournament_registrations_status_check '.
            "CHECK (status IN ('".implode("','", self::NEW_VALUES)."'))"
        );
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE tournament_registrations DROP CONSTRAINT tournament_registrations_status_check');
        DB::statement(
            'ALTER TABLE tournament_registrations ADD CONSTRAINT tournament_registrations_status_check '.
            "CHECK (status IN ('".implode("','", self::OLD_VALUES)."'))"
        );
    }
};
