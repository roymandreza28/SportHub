<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Distinguishes a walkover/forfeit completion (venue organizer declares a
// winner before the game is ever played) from a normally-scored one, so a
// 0-0 score doesn't look like a real result on the bracket card or a shared
// news post — see MatchController::forfeit().
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('matches', function (Blueprint $table) {
            $table->boolean('won_by_default')->default(false)->after('winner_team_id');
        });
    }

    public function down(): void
    {
        Schema::table('matches', function (Blueprint $table) {
            $table->dropColumn('won_by_default');
        });
    }
};
