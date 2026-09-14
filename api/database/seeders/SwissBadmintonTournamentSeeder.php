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

// A main-organizer Badminton Singles tournament in SWISS format. 8
// individual players -> BracketService::totalSwissRounds(8) === 4
// (ceil(log2(8)) = 3 mathematically-minimum rounds, plus one more for a
// more reliable final ranking — see that method's own doc comment).
// Rounds 1-3 are completed with full best-of-3-sets scorelines and
// individual player stats; completing each round's last match auto-pairs
// the next by then-current standings (see maybeAdvanceSwissRound()) — the
// final round (4) is left scheduled, already paired — "already at the
// final round" without the tournament actually being over, same framing
// as every sibling seeder in this file group. Leaving sport_format_id
// unset is what makes this an individual (not team) tournament throughout
// the system — see BracketService::generate()'s isTeamTournament flag.
class SwissBadmintonTournamentSeeder extends Seeder
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
            'name' => 'Binangonan Swiss Badminton Cup',
            'sport_id' => $sport->id,
            'format' => 'swiss',
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

        // Rounds 1-3 (4 matches each) — completing each round's last match
        // auto-pairs the next by then-current standings.
        foreach ([1, 2, 3] as $round) {
            $matches = GameMatch::where('bracket_id', $bracket->id)->where('bracket_type', 'swiss')->where('round', $round)->orderBy('id')->get();
            foreach ($matches as $match) {
                $this->simulateDetailedMatch($match, $bracketService, $tournament);
            }
        }

        // Round 4 — the final Swiss round (totalSwissRounds(8) === 4),
        // auto-paired above. Left scheduled.
        $finalRound = GameMatch::where('bracket_id', $bracket->id)->where('bracket_type', 'swiss')->where('round', 4)->orderBy('id')->get();
        foreach ($finalRound as $match) {
            $match->update(['scheduled_at' => now()->addMinutes(10), 'court_id' => $court->id]);
        }

        $this->command?->info("Seeded '{$tournament->name}' (id {$tournament->id}) — swiss, {$players->count()} players, rounds 1-3 completed with full scorelines/player stats, final round (round 4) pending.");
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
            'scheduled_at' => now()->subHours(rand(24, 96)),
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
