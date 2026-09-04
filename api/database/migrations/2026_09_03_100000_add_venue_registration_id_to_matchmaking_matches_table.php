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
        Schema::table('matchmaking_matches', function (Blueprint $table) {
            // Set only when whichever side of the pair specified a venue +
            // preferred start/end time — see MatchmakingRequestController::
            // store(), which auto-reserves that slot (pending, subject to
            // facilitator approval) the instant the pair is found. Null
            // otherwise: a pair that never named a venue has nothing to
            // reserve, same as before this column existed.
            $table->foreignId('venue_registration_id')->nullable()->after('matched_at')
                ->constrained()->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('matchmaking_matches', function (Blueprint $table) {
            $table->dropConstrainedForeignId('venue_registration_id');
        });
    }
};
