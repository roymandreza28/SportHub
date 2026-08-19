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
        Schema::table('conversations', function (Blueprint $table) {
            // Unique — the idempotency key for the auto-created team chat,
            // mirroring how venue_registration_id already dedupes booking
            // conversations.
            $table->foreignId('team_id')->nullable()->unique()->after('venue_registration_id')
                ->constrained('teams')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            $table->dropConstrainedForeignId('team_id');
        });
    }
};
