<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // A venue facilitator's own payment QR (e.g. GCash) — shown on
            // the matchmaking down-payment receipt so a paired player/coach
            // can scan-to-pay directly instead of only being told to
            // message the facilitator. Nullable: most roles never set this.
            $table->string('qr_code_path')->nullable()->after('cover_path');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('qr_code_path');
        });
    }
};
