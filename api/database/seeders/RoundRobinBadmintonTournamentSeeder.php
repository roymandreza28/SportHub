<?php

namespace Database\Seeders;

use App\Models\GameMatch;
use App\Models\MatchPlayerStat;
use App\Models\Sport;
use App\Models\Tournament;
use App\Models\TournamentRegistration;
use App\Models\User;
use App\Models\Venue;
use App\Services\BracketService;
use App\Support\PlayerStatFieldSets;
use Illuminate\Database\Seeder;

// A main-organizer Badminton Singles tournament in ROUND_ROBIN format. 8
// individual players -> BracketService::generateRoundRobin()'s circle
// method schedules 7 rounds of 4 matches each (nobody playing twice in the
// same round). Rounds 1-6 are completed with full best-of-3-sets scorelines
// and individual player stats; round 7 (the round robin's own final round
// of fixtures) is left scheduled — "already at the final round" without
// the tournament actually being over, same framing as every sibling seeder
// in this file group. advanceWinner() has no bracket to advance for
// round_robin (just a standings table), but it does still rebuild the
// bracket's cached structure snapshot on every completion — see its own
// comment — which is what actually makes each simulated match's winner
// show up in the bracket view at all. Leaving sport_format_id unset is
// what makes this an individual (not team) tournament throughout the
// system — see BracketService::generate()'s isTeamTournament flag.
class RoundRobinBadmintonTournamentSeeder extends Seeder
{
    public function run(): void
    {
        $organizer = User::where('email', 'organizer@sporthub.test')->first();
        $venueOrganizer = User::where('email', 'venue_organizer@sporthub.test')->first();
        $livestreamOrganizer = User::where('email', 'livestream_organizer@sporthub.test')->first();
        $gymnasium = Venue::where('name', 'Binangonan Recreation and Conference Center (BRCC)')->first();

        if (! $organizer || ! $venueOrganizer || ! $gymnasium) {
            $this->command?->warn('Missing base demo accounts/venue — run the main seeders first.');

            return;
        }

        $sport = Sport::where('name', 'Badminton')->first();
        $court = $gymnasium->courts()->where('name', 'Badminton Courts (Gymnasium)')->first();

        if (! $sport || ! $court) {
            $this->command?->warn('Missing Badminton sport/court — run SportsSeeder/VenueSeeder first.');

            return;
        }

        $players = User::role('player')->orderBy('id')->limit(8)->get();

        if ($players->count() < 8) {
            $this->command?->warn("Need 8 player accounts — found {$players->count()}. Run ExtendedTournamentsSeeder first.");

            return;
        }

        $bracketService = app(BracketService::class);

        $tournament = Tournament::create([
            'organizer_id' => $organizer->id,
            'name' => 'Binangonan Round Robin Badminton Cup',
            'sport_id' => $sport->id,
            'format' => 'round_robin',
            'starts_at' => now()->subDays(3),
            'venue_id' => $gymnasium->id,
            'venue_organizer_id' => $venueOrganizer->id,
            'livestream_organizer_id' => $livestreamOrganizer?->id,
            'status' => 'ongoing',
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

        $bracket = $bracketService->generate($tournament);

        // 8 players -> 7 real rounds (4 matches each) from the circle-method
        // schedule. Play out every round except the last, leaving that
        // final round's games scheduled.
        $lastRound = GameMatch::where('bracket_id', $bracket->id)->max('round');

        $earlierFixtures = GameMatch::where('bracket_id', $bracket->id)->where('round', '<', $lastRound)->orderBy('round')->orderBy('id')->get();
        foreach ($earlierFixtures as $match) {
            $this->simulateDetailedMatch($match, $bracketService, $tournament);
        }

        GameMatch::where('bracket_id', $bracket->id)->where('round', $lastRound)
            ->update(['scheduled_at' => now()->addMinutes(10), 'court_id' => $court->id]);

        $this->command?->info("Seeded '{$tournament->name}' (id {$tournament->id}) — round robin, {$players->count()} players, rounds 1-".($lastRound - 1)." completed with full scorelines/player stats, final round ({$lastRound}) pending.");
    }

    private function simulateDetailedMatch(GameMatch $match, BracketService $bracketService, Tournament $tournament): void
    {
        [$sets, $setsWonA, $setsWonB] = $this->playSets($tournament->sets_to_win ?? 2);

        $match->update([
            'sets' => $sets,
            'score_a' => $setsWonA,
            'score_b' => $setsWonB,
            'status' => 'completed',
            'winner_id' => $setsWonA > $setsWonB ? $match->participant_a_id : $match->participant_b_id,
            'scheduled_at' => now()->subHours(rand(6, 96)),
        ]);

        $this->recordPlayerStats($match, $match->participant_a_id);
        $this->recordPlayerStats($match, $match->participant_b_id);

        $bracketService->advanceWinner($match->fresh());
    }

    /** @return array{0: array<int, array{score_a: int, score_b: int}>, 1: int, 2: int} */
    private function playSets(int $setsToWin): array
    {
        $sets = [];
        $setsWonA = 0;
        $setsWonB = 0;

        while ($setsWonA < $setsToWin && $setsWonB < $setsToWin) {
            $a = rand(15, 21);
            $b = rand(15, 21);
            if ($a === $b) {
                $b--;
            }
            $a > $b ? $setsWonA++ : $setsWonB++;
            $sets[] = ['score_a' => $a, 'score_b' => $b];
        }

        return [$sets, $setsWonA, $setsWonB];
    }

    private function recordPlayerStats(GameMatch $match, ?int $userId): void
    {
        if (! $userId) {
            return;
        }

        $fields = PlayerStatFieldSets::for('Badminton') ?? [];

        $stats = [];
        foreach ($fields as $field) {
            $stats[$field['key']] = $field['key'] === 'points_won'
                ? rand(40, 90)
                : rand(0, max(1, intdiv($field['scale_max'], 15)));
        }

        MatchPlayerStat::updateOrCreate(
            ['match_id' => $match->id, 'user_id' => $userId],
            ['team_id' => null, 'sport_id' => $match->bracket->tournament->sport_id, 'stats' => $stats]
        );
    }
}
