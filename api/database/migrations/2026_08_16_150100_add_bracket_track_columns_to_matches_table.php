<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('matches', function (Blueprint $table) {
            // Non-null only for group_stage tournaments' group-play matches —
            // marks which pool a match belongs to before the knockout phase.
            $table->unsignedTinyInteger('group_number')->nullable()->after('round');
            // Non-null only for double_elimination matches — distinguishes
            // the winners bracket, losers bracket, and grand final tracks
            // that share the same `matches` table.
            $table->string('bracket_type')->nullable()->after('group_number');
        });
    }

    public function down(): void
    {
        Schema::table('matches', function (Blueprint $table) {
            $table->dropColumn(['group_number', 'bracket_type']);
        });
    }
};
