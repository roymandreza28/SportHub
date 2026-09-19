<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Bumped by POST /api/heartbeat, fired every ~25s from any
            // authenticated tab — see HeartbeatController. "Online" is a
            // computed state (last_seen_at within the last ~90s), not a
            // stored flag, so it never goes stale from a browser crash or
            // dropped connection the way a raw is_online boolean would.
            $table->timestamp('last_seen_at')->nullable()->index();
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('last_seen_at');
        });
    }
};
