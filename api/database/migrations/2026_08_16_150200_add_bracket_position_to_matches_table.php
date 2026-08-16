<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('matches', function (Blueprint $table) {
            // Only set for double_elimination losers-bracket matches, whose
            // round-1 pairings can have gaps (skipped when both feeding
            // winners-bracket matches were byes) — a stable position lets
            // later rounds address them without relying on row-creation
            // order, which those gaps would otherwise desync.
            $table->unsignedTinyInteger('bracket_position')->nullable()->after('bracket_type');
        });
    }

    public function down(): void
    {
        Schema::table('matches', function (Blueprint $table) {
            $table->dropColumn('bracket_position');
        });
    }
};
