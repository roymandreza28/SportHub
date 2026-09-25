<?php

namespace Database\Seeders;

use App\Models\Sport;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Seeder;

// Backfills randomized skill-level evaluations across every seeded player —
// deliberately UNEVEN, matching how a real municipality's evaluation
// program would actually look: some players have been assessed in several
// sports, most in just one or two, and a good chunk not at all yet. Every
// other seeder that touches skill_levels (SampleDataSeeder's single
// Basketball row for the demo player) only ever evaluates ONE specific
// player in ONE specific sport — this is the only seeder that sweeps the
// whole player roster.
//
// Idempotent PER PLAYER, not per row: a player who already has at least one
// skill_levels row (whether from this seeder's own earlier run or from
// SampleDataSeeder) is left completely alone, never re-rolled or topped up
// — re-seeding never duplicates or overwrites an evaluation. The one
// deliberate exception is a player who rolled zero sports last time: since
// "zero rows" is indistinguishable from "never processed," a later re-run
// can roll them a non-zero count instead. That's harmless (it only ever
// ADDS plausible data, via updateOrCreate() so the skill_levels table's own
// unique(player_profile_id, sport_id) constraint is never at risk either
// way) — safe to leave a boot flag on across multiple boots, same as this
// codebase's other backfill seeders.
class PlayerSkillEvaluationSeeder extends Seeder
{
    // Weighted rather than uniform — a real evaluated population skews
    // toward beginner/casual, with fewer developing/competitive athletes
    // and 'professional' rarer still. 'professional' is reserved for
    // Bowling only below, matching the frontend's own tiersFor() convention
    // (web/src/lib/skillLevels.ts) — nothing in the DB enforces this, it's
    // just what keeps the seeded data consistent with what the UI actually
    // offers a coach for every other sport.
    private const LEVEL_WEIGHTS = [
        'beginner' => 3,
        'casual_player' => 3,
        'developing_athlete' => 2,
        'competitive_athlete' => 1,
    ];

    private const BOWLING_LEVEL_WEIGHTS = self::LEVEL_WEIGHTS + ['professional' => 1];

    public function run(): void
    {
        $players = User::role('player')->get();
        $coaches = User::role('coach')->get();
        $sports = Sport::all();

        if ($coaches->isEmpty() || $sports->isEmpty()) {
            return;
        }

        foreach ($players as $player) {
            if ($player->playerProfile?->skillLevels()->exists()) {
                continue;
            }

            // 0 through min(4, every sport) — weighted toward the lower end
            // (rand(0,2) twice, floor'd, roughly triangular) so "one or two
            // sports evaluated" is the common case and "evaluated in
            // everything" stays rare, same shape a real coach roster would
            // produce rather than a flat/uniform distribution.
            $sportCount = min($sports->count(), (int) round((rand(0, 3) + rand(0, 3)) / 2));

            if ($sportCount === 0) {
                continue;
            }

            $profile = $player->playerProfile()->firstOrCreate([], [
                'date_of_birth' => now()->subYears(rand(16, 45))->subDays(rand(0, 365)),
            ]);

            foreach ($sports->random($sportCount) as $sport) {
                $weights = $sport->name === 'Bowling' ? self::BOWLING_LEVEL_WEIGHTS : self::LEVEL_WEIGHTS;

                $profile->skillLevels()->updateOrCreate(
                    ['sport_id' => $sport->id],
                    [
                        'coach_id' => $coaches->random()->id,
                        'level' => $this->weightedLevel($weights),
                        // 1 in 5 evaluations has no formal numeric score
                        // yet — a coach who's assessed the tier but hasn't
                        // logged a score, a real gap this app's own
                        // nullable score column exists to allow for.
                        'score' => rand(1, 5) === 1 ? null : round(rand(2000, 9500) / 100, 2),
                        'evaluated_at' => Carbon::now()->subDays(rand(1, 180)),
                    ]
                );
            }
        }
    }

    /** @param  array<string, int>  $weights */
    private function weightedLevel(array $weights): string
    {
        $total = array_sum($weights);
        $roll = rand(1, $total);

        foreach ($weights as $level => $weight) {
            if ($roll <= $weight) {
                return $level;
            }
            $roll -= $weight;
        }

        // Unreachable given $roll is bounded by $total above — satisfies
        // static analysis' return-type check without a real fallback path.
        return array_key_first($weights);
    }
}
