<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// The broadcaster's own device records its outgoing MediaStream client-side
// (MediaRecorder) for the whole broadcast and uploads the file once they
// stop — there's no server-side media pipeline in this app's WebRTC relay
// (LivestreamBroadcast -> LivestreamViewer -> LiveRelayVideo is pure
// browser-to-browser signaling, the server never sees the video itself), so
// this is the one place a recording can come from at all.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('livestreams', function (Blueprint $table) {
            $table->string('recording_path')->nullable()->after('chat_channel_name');
        });
    }

    public function down(): void
    {
        Schema::table('livestreams', function (Blueprint $table) {
            $table->dropColumn('recording_path');
        });
    }
};
