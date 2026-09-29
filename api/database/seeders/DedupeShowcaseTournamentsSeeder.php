<?php

namespace Database\Seeders;

use App\Models\Tournament;
use Illuminate\Database\Seeder;

// Cleanup for a real mistake: SEED_BASKETBALL_FORMATS_ON_BOOT gates several
// non-idempotent seeders (DoubleEliminationBasketballTournamentSeeder,
// RoundRobinBadmintonTournamentSeeder, GroupStageBadmintonTournamentSeeder,
// SwissBadmintonTournamentSeeder — each uses Tournament::create()
// unconditionally). The flag had already been left "true" on Render from
// an earlier session, then set "true" again in this one to unlock
// GenderBackfillSeeder/MalePlayerTopUpSeeder for the two new completed
// tournaments — which re-ran those four non-idempotent seeders a second
// time too, producing an exact duplicate of each by name.
//
// This finds any of the showcase tournament NAMES below that now have
// more than one row, keeps the OLDEST (lowest id — the original, more
// likely to have accumulated real interaction), and deletes every newer
// duplicate. Tournament's own cascadeOnDelete foreign keys (brackets,
// tournament_registrations, and transitively matches/match_events/
// match_stat_sheets/match_player_stats) clean up everything the duplicate
// owns; nothing else in the schema has a hard FK to tournaments.id.
// Idempotent — a name with only one row (or none) is left untouched, so
// running this again once the duplicates are gone is always a safe no-op.
class DedupeShowcaseTournamentsSeeder extends Seeder
{
    private const NAMES = [
        'Binangonan Double-Elimination Basketball Cup',
        'Binangonan Round Robin Badminton Cup',
        'Binangonan Group Stage Badminton Cup',
        'Binangonan Swiss Badminton Cup',
        'Binangonan Facilitator Swiss Badminton Open',
        'Binangonan Facilitator Double-Elimination Badminton Cup',
        'Binangonan Facilitator Single-Elimination Badminton Cup',
        // The two CompletedMensBasketball*Seeder tournaments — same
        // SEED_BASKETBALL_FORMATS_ON_BOOT block, same Tournament::create()
        // non-idempotency, just missed when this list was first written.
        // Render's free-tier spin-down/spin-up cycle re-running the boot
        // script hundreds of times while the flag sat on produced 18
        // duplicates of each of these before this was caught.
        'Binangonan Rizal Basketball Finals',
        'Binangonan Barangay Basketball Showdown',
    ];

    public function run(): void
    {
        $deleted = 0;

        foreach (self::NAMES as $name) {
            $rows = Tournament::where('name', $name)->orderBy('id')->get();
            if ($rows->count() <= 1) {
                continue;
            }

            $duplicateIds = $rows->slice(1)->pluck('id');
            Tournament::whereIn('id', $duplicateIds)->delete();
            $deleted += $duplicateIds->count();

            $this->command?->info("'{$name}': kept id {$rows->first()->id}, deleted ".$duplicateIds->count().' duplicate(s): '.$duplicateIds->implode(', '));
        }

        $this->command?->info("Dedupe complete — {$deleted} duplicate tournament(s) removed.");
    }
}
