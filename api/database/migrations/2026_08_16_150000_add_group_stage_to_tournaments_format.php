<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_format_check');
        DB::statement("ALTER TABLE tournaments ADD CONSTRAINT tournaments_format_check CHECK (format IN ('single_elimination', 'double_elimination', 'round_robin', 'group_stage'))");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_format_check');
        DB::statement("ALTER TABLE tournaments ADD CONSTRAINT tournaments_format_check CHECK (format IN ('single_elimination', 'double_elimination', 'round_robin'))");
    }
};
