<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Drop the old constraint FIRST — it doesn't permit 'ongoing'/
        // 'registration' either, so the data-migration UPDATEs below would
        // fail against it just as much as against a constraint that had
        // already dropped 'open'/'in_progress'. There's a brief window here
        // with no CHECK constraint at all, which is fine for a single
        // migration transaction.
        DB::statement('ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_status_check');

        DB::statement("UPDATE tournaments SET status = 'registration' WHERE status = 'open'");
        DB::statement("UPDATE tournaments SET status = 'ongoing' WHERE status = 'in_progress'");

        DB::statement("ALTER TABLE tournaments ADD CONSTRAINT tournaments_status_check CHECK (status IN ('draft', 'registration', 'preparation', 'ongoing', 'completed', 'cancelled'))");
        DB::statement("ALTER TABLE tournaments ALTER COLUMN status SET DEFAULT 'draft'");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_status_check');

        DB::statement("UPDATE tournaments SET status = 'open' WHERE status = 'registration'");
        DB::statement("UPDATE tournaments SET status = 'in_progress' WHERE status IN ('preparation', 'ongoing')");

        DB::statement("ALTER TABLE tournaments ADD CONSTRAINT tournaments_status_check CHECK (status IN ('draft', 'open', 'in_progress', 'completed', 'cancelled'))");
        DB::statement("ALTER TABLE tournaments ALTER COLUMN status SET DEFAULT 'draft'");
    }
};
