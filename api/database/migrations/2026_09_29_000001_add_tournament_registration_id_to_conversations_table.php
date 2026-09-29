<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            // Unique — the idempotency key for the auto-created coach<->
            // organizer payment conversation, mirroring how
            // venue_registration_id/team_id already dedupe their own
            // auto-created conversations.
            $table->foreignId('tournament_registration_id')->nullable()->unique()->after('team_id')
                ->constrained('tournament_registrations')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            $table->dropConstrainedForeignId('tournament_registration_id');
        });
    }
};
