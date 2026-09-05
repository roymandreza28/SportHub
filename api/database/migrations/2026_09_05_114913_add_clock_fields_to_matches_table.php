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
            // Only basketball/3x3's scoreboards have a real game clock —
            // every other sport just leaves these null, and the public
            // scoreboard widget skips the clock section entirely for them.
            // clock_period_label is a ready-to-display string ("Period 2",
            // "Overtime 1", "Sudden Death") computed by the organizer's own
            // scoreboard, which already knows the rule preset — a public
            // viewer never does, so reconstructing the label from raw
            // period numbers on that side isn't possible.
            $table->integer('clock_seconds_remaining')->nullable()->after('won_by_default');
            $table->boolean('clock_running')->default(false)->after('clock_seconds_remaining');
            $table->string('clock_period_label')->nullable()->after('clock_running');
            $table->timestamp('clock_synced_at')->nullable()->after('clock_period_label');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('matches', function (Blueprint $table) {
            $table->dropColumn(['clock_seconds_remaining', 'clock_running', 'clock_period_label', 'clock_synced_at']);
        });
    }
};
