<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('conversation_participants', function (Blueprint $table) {
            // A far-future timestamp (not just a boolean) so "mute for 1
            // hour" and "mute until I turn it back on" share one column —
            // see ConversationController::mute()'s own comment.
            $table->timestamp('muted_until')->nullable()->after('last_read_at');
            // Archived/hidden ("deleted for me") are two independent,
            // per-viewer flags, both cleared automatically the next time a
            // message lands in the conversation — see
            // ConversationMessageController::store()'s own comment.
            $table->timestamp('archived_at')->nullable()->after('muted_until');
            $table->timestamp('hidden_at')->nullable()->after('archived_at');
            // Set on the BLOCKING participant's own row — checked from
            // either side before a new message is allowed through, so
            // either participant blocking silences both directions.
            $table->timestamp('blocked_at')->nullable()->after('hidden_at');
        });
    }

    public function down(): void
    {
        Schema::table('conversation_participants', function (Blueprint $table) {
            $table->dropColumn(['muted_until', 'archived_at', 'hidden_at', 'blocked_at']);
        });
    }
};
