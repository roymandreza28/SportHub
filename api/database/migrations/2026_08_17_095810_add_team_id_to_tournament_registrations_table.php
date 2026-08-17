<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tournament_registrations', function (Blueprint $table) {
            $table->foreignId('team_id')->nullable()->after('user_id')
                ->constrained('teams')->cascadeOnDelete();
            $table->unique(['tournament_id', 'team_id']);
        });

        // A registration row is either individual (user_id set, team_id
        // null) or team-based (team_id set, user_id null) — never both.
        DB::statement('ALTER TABLE tournament_registrations ALTER COLUMN user_id DROP NOT NULL');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE tournament_registrations ALTER COLUMN user_id SET NOT NULL');

        Schema::table('tournament_registrations', function (Blueprint $table) {
            $table->dropUnique(['tournament_id', 'team_id']);
            $table->dropConstrainedForeignId('team_id');
        });
    }
};
