<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// Adds a 5th tier, 'professional' (Bowling's real PBA/international-tour
// level, per the sport's own skill-level ladder — no other seeded sport
// offers it in the coach evaluation form, see skillLevels.ts's tiersFor()).
// Same drop/re-add-the-named-CHECK-constraint pattern as the earlier
// 2026_07_27_000000_rename_skill_level_tiers migration.
return new class extends Migration
{
    private const OLD_VALUES = ['beginner', 'casual_player', 'developing_athlete', 'competitive_athlete'];

    private const NEW_VALUES = ['beginner', 'casual_player', 'developing_athlete', 'competitive_athlete', 'professional'];

    public function up(): void
    {
        DB::statement('ALTER TABLE skill_levels DROP CONSTRAINT skill_levels_level_check');
        DB::statement(
            'ALTER TABLE skill_levels ADD CONSTRAINT skill_levels_level_check '.
            "CHECK (level IN ('".implode("','", self::NEW_VALUES)."'))"
        );
    }

    public function down(): void
    {
        DB::table('skill_levels')->where('level', 'professional')->update(['level' => 'competitive_athlete']);

        DB::statement('ALTER TABLE skill_levels DROP CONSTRAINT skill_levels_level_check');
        DB::statement(
            'ALTER TABLE skill_levels ADD CONSTRAINT skill_levels_level_check '.
            "CHECK (level IN ('".implode("','", self::OLD_VALUES)."'))"
        );
    }
};
