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
            // One conversation per booking — auto-created when a venue
            // facilitator approves it, auto-(soft)deleted once the booking's
            // day is over. Nullable/nullOnDelete since this column only
            // applies to these system-generated booking conversations, not
            // regular friend-to-friend ones.
            $table->foreignId('venue_registration_id')
                ->nullable()
                ->unique()
                ->after('direct_key')
                ->constrained()
                ->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('conversations', function (Blueprint $table) {
            $table->dropConstrainedForeignId('venue_registration_id');
        });
    }
};
