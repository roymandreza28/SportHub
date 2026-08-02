<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        DB::statement('ALTER TABLE skill_levels DROP CONSTRAINT skill_levels_level_check');

        DB::table('skill_levels')->where('level', 'intermediate')->update(['level' => 'casual_player']);
        DB::table('skill_levels')->where('level', 'advanced')->update(['level' => 'developing_athlete']);
        DB::table('skill_levels')->where('level', 'pro')->update(['level' => 'competitive_athlete']);

        DB::statement("ALTER TABLE skill_levels ADD CONSTRAINT skill_levels_level_check CHECK (level IN ('beginner', 'casual_player', 'developing_athlete', 'competitive_athlete'))");
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE skill_levels DROP CONSTRAINT skill_levels_level_check');

        DB::table('skill_levels')->where('level', 'casual_player')->update(['level' => 'intermediate']);
        DB::table('skill_levels')->where('level', 'developing_athlete')->update(['level' => 'advanced']);
        DB::table('skill_levels')->where('level', 'competitive_athlete')->update(['level' => 'pro']);

        DB::statement("ALTER TABLE skill_levels ADD CONSTRAINT skill_levels_level_check CHECK (level IN ('beginner', 'intermediate', 'advanced', 'pro'))");
    }
};
