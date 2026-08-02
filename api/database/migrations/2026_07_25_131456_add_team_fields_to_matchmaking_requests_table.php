<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('matchmaking_requests', function (Blueprint $table) {
            // Nullable: existing rows predate formats/teams, and solo formats
            // (players_per_side === 1) never set team_id at all.
            $table->foreignId('sport_format_id')->nullable()->after('sport_id')->constrained()->nullOnDelete();
            $table->foreignId('team_id')->nullable()->after('sport_format_id')->constrained()->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('matchmaking_requests', function (Blueprint $table) {
            $table->dropConstrainedForeignId('sport_format_id');
            $table->dropConstrainedForeignId('team_id');
        });
    }
};
