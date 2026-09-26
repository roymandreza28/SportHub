<?php

namespace Database\Seeders;

use App\Models\Sport;
use App\Models\Tournament;
use App\Models\TournamentRegistration;
use App\Models\User;
use App\Models\Venue;
use Illuminate\Database\Seeder;

// A venue-facilitator-hosted Badminton Singles tournament in SINGLE_ELIMINATION
// format, still at 'registration' — the simplest of the three new demo
// tournaments: 'format' is set up front (a Tournament's intended bracket
// shape is chosen at creation, independent of whether a bracket has
// actually been generated yet), but BracketService::generate() is
// deliberately NEVER called here, so there is no Bracket/GameMatch row at
// all — exactly what a real tournament looks like between being announced
// and registration closing. A partial (not full) roster is registered, so
// the tournament reads as "still filling up" rather than already closed.
class SingleEliminationBadmintonRegistrationSeeder extends Seeder
{
    public function run(): void
    {
        $facilitator = User::where('email', 'venue_facilitator@sporthub.test')->first();
        $gymnasium = Venue::where('name', 'Binangonan Recreation and Conference Center (BRCC)')->first();

        if (! $facilitator || ! $gymnasium) {
            $this->command?->warn('Missing base demo accounts/venue — run the main seeders first.');

            return;
        }

        $sport = Sport::where('name', 'Badminton')->first();

        if (! $sport) {
            $this->command?->warn('Missing Badminton sport — run SportsSeeder first.');

            return;
        }

        // A fourth, distinct slice of the player pool (past the other two
        // new seeders' 8+4) so this tournament's registrants don't overlap
        // with either of them.
        $players = User::role('player')->orderBy('id')->skip(20)->limit(5)->get();

        if ($players->isEmpty()) {
            $this->command?->warn('No further player accounts available beyond the first 20 — run ExtendedTournamentsSeeder/MalePlayerTopUpSeeder first.');

            return;
        }

        $tournament = Tournament::create([
            'organizer_id' => $facilitator->id,
            'name' => 'Binangonan Facilitator Single-Elimination Badminton Cup',
            'sport_id' => $sport->id,
            'format' => 'single_elimination',
            'starts_at' => now()->addDays(10),
            'venue_id' => $gymnasium->id,
            'venue_organizer_id' => $facilitator->id,
            'livestream_organizer_id' => $facilitator->id,
            'status' => 'registration',
            'scoring_type' => 'best_of_sets',
            'sets_to_win' => 2,
        ]);

        foreach ($players as $player) {
            TournamentRegistration::create([
                'tournament_id' => $tournament->id,
                'user_id' => $player->id,
                'registered_by' => $player->id,
                'status' => 'confirmed',
            ]);
        }

        $this->command?->info("Seeded '{$tournament->name}' (id {$tournament->id}) — single elimination, {$players->count()} players registered so far, registration still open, no bracket generated yet.");
    }
}
