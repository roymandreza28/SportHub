<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('matches', function (Blueprint $table) {
            // Parallel to participant_a_id/participant_b_id/winner_id —
            // populated instead of (never alongside) those for a match
            // belonging to a team tournament.
            $table->foreignId('participant_a_team_id')->nullable()->after('participant_b_id')
                ->constrained('teams')->nullOnDelete();
            $table->foreignId('participant_b_team_id')->nullable()->after('participant_a_team_id')
                ->constrained('teams')->nullOnDelete();
            $table->foreignId('winner_team_id')->nullable()->after('winner_id')
                ->constrained('teams')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('matches', function (Blueprint $table) {
            $table->dropConstrainedForeignId('winner_team_id');
            $table->dropConstrainedForeignId('participant_b_team_id');
            $table->dropConstrainedForeignId('participant_a_team_id');
        });
    }
};
