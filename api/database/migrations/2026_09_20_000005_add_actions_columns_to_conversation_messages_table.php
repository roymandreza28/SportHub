<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('conversation_messages', function (Blueprint $table) {
            // Messenger-style "Remove": set (never a hard delete) so the
            // row survives as a placeholder ("You removed a message" /
            // "{name} removed a message") instead of leaving a silent gap
            // in the thread — see ConversationMessageController::destroy().
            $table->timestamp('removed_at')->nullable()->after('attachment_path');
            // Self-referencing, both nullOnDelete rather than cascading —
            // the ORIGINAL message being removed/deleted shouldn't take a
            // reply/forward quoting it down with it; the quote just loses
            // its target and the frontend falls back to "Original message
            // unavailable".
            $table->foreignId('reply_to_message_id')->nullable()->after('removed_at')
                ->constrained('conversation_messages')->nullOnDelete();
            $table->foreignId('forwarded_from_message_id')->nullable()->after('reply_to_message_id')
                ->constrained('conversation_messages')->nullOnDelete();
            // Any participant can pin/unpin (not just the author) — same
            // as a real group chat's shared pinned-messages list.
            $table->timestamp('pinned_at')->nullable()->after('forwarded_from_message_id');
        });
    }

    public function down(): void
    {
        Schema::table('conversation_messages', function (Blueprint $table) {
            // Not dropConstrainedForeignId() — it guesses the referenced
            // table from the column name (would look for a nonexistent
            // "reply_to_messages"/"forwarded_from_messages" table instead
            // of the explicit constrained('conversation_messages') above).
            // dropForeign(['column']) instead derives the constraint name
            // from THIS table + column, which is what was actually created.
            $table->dropForeign(['reply_to_message_id']);
            $table->dropForeign(['forwarded_from_message_id']);
            $table->dropColumn(['removed_at', 'reply_to_message_id', 'forwarded_from_message_id', 'pinned_at']);
        });
    }
};
