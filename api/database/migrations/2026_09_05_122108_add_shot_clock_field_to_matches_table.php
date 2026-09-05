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
        Schema::table('matches', function (Blueprint $table) {
            // Ticks down alongside clock_seconds_remaining (same
            // clock_running/clock_synced_at pair — they're always started,
            // paused, and synced together) — null whenever the organizer
            // hasn't enabled a shot clock for this game, so the shared post's
            // widget just omits it.
            $table->integer('clock_shot_seconds_remaining')->nullable()->after('clock_seconds_remaining');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('matches', function (Blueprint $table) {
            $table->dropColumn('clock_shot_seconds_remaining');
        });
    }
};
