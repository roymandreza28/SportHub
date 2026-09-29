<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tournaments', function (Blueprint $table) {
            // Null/0 = free to join (the default for every existing
            // tournament). Set once at creation only — same rationale as
            // required_gender: changing the entry fee after teams/players
            // have already registered (and possibly already paid) would be
            // unfair, so TournamentController::update() deliberately never
            // accepts this field, only store().
            $table->decimal('registration_fee', 8, 2)->nullable()->after('sets_to_win');
        });
    }

    public function down(): void
    {
        Schema::table('tournaments', function (Blueprint $table) {
            $table->dropColumn('registration_fee');
        });
    }
};
