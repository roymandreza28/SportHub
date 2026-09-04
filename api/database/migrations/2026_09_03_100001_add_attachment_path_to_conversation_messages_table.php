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
        Schema::table('conversation_messages', function (Blueprint $table) {
            // Lets a message carry a photo instead of (or alongside) text —
            // added for the venue-booking conversation flow, where a player
            // sends a down-payment (e.g. GCash) screenshot to the
            // facilitator. See ConversationMessageController::store() for
            // the accompanying "body OR attachment, not neither" validation.
            $table->string('attachment_path')->nullable()->after('body');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('conversation_messages', function (Blueprint $table) {
            $table->dropColumn('attachment_path');
        });
    }
};
