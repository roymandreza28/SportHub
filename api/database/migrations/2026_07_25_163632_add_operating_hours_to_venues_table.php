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
        Schema::table('venues', function (Blueprint $table) {
            // Daily operating hours, in Asia/Manila wall-clock time (the app
            // serves a single municipality, so no per-venue timezone).
            // Nullable — an unset venue is treated as open 24 hours, same as
            // before this column existed.
            $table->time('opens_at')->nullable()->after('description');
            $table->time('closes_at')->nullable()->after('opens_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('venues', function (Blueprint $table) {
            $table->dropColumn(['opens_at', 'closes_at']);
        });
    }
};
