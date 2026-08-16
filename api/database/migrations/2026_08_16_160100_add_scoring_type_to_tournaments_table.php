<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tournaments', function (Blueprint $table) {
            // 'single_score' (default, current behavior) or 'best_of_sets' —
            // table tennis's "Best of 5/7 Sets" and volleyball's "Best of
            // Series" are match-scoring formats, not bracket shapes, so they
            // layer on top of whichever `format` the tournament uses.
            $table->string('scoring_type')->default('single_score')->after('format');
            // Sets needed to WIN the match (e.g. 3 for best-of-5, 4 for
            // best-of-7) — null when scoring_type is 'single_score'.
            $table->unsignedTinyInteger('sets_to_win')->nullable()->after('scoring_type');
        });

        DB::statement("ALTER TABLE tournaments ADD CONSTRAINT tournaments_scoring_type_check CHECK (scoring_type IN ('single_score', 'best_of_sets'))");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE tournaments DROP CONSTRAINT IF EXISTS tournaments_scoring_type_check');

        Schema::table('tournaments', function (Blueprint $table) {
            $table->dropColumn(['scoring_type', 'sets_to_win']);
        });
    }
};
