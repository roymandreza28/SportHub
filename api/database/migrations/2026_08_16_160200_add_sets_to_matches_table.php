<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('matches', function (Blueprint $table) {
            // Only populated for best_of_sets tournaments — an ordered array
            // of {score_a, score_b} per set played. score_a/score_b on the
            // match itself then hold SETS WON, not points, keeping every
            // existing consumer (MatchCard, ScoreboardLive's tally) working
            // unchanged for both scoring types.
            $table->jsonb('sets')->nullable()->after('score_b');
        });
    }

    public function down(): void
    {
        Schema::table('matches', function (Blueprint $table) {
            $table->dropColumn('sets');
        });
    }
};
