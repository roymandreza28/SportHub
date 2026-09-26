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

// A venue-facilitator-hosted Badminton Singles tournament in SWISS format,
// fully COMPLETED — the actually-finished sibling of SwissBadmintonTournamentSeeder,
// which deliberately leaves its own final round scheduled. Here every one of
// the 4 rounds (BracketService::totalSwissRounds(8) === 4) is played out, so
// the last match's own advanceWinner() call detects currentRound >=
// totalRounds (see BracketService::maybeAdvanceSwissRound()) and calls
// completeTournament() itself — status=>'completed' and champion_id are set
// by that call, never assigned directly by this seeder. starts_at is pushed
// further back than the "still at its final round" sibling since a full
// 4-round event needs more elapsed time to be plausible.
class CompletedSwissBadmintonTournamentSeeder extends Seeder
{
    public function run(): void
    {
        // A venue_facilitator has no separate staff to hand the venue-
        // organizer/livestream-organizer jobs to — TournamentController::
        // store() auto-assigns both to the facilitator's own id whenever
        // THEY are the one creating the tournament (see its own doc
        // comment), so this seeder mirrors that exactly rather than
        // pulling in the separate venue_organizer@/livestream_organizer@
        // demo accounts the main-organizer-hosted seeders use.
        $facilitator = User::where('email', 'venue_facilitator@sporthub.test')->first();
        $gymnasium = Venue::where('name', 'Binangonan Recreation and Conference Center (BRCC)')->first();

        if (! $facilitator || ! $gymnasium) {
            $this->command?->warn('Missing base demo accounts/venue — run the main seeders first.');

            return;
        }

        $sport = Sport::where('name', 'Badminton')->first();
        $court = $gymnasium->courts()->where('name', 'Badminton Courts (Gymnasium)')->first();

        if (! $sport || ! $court) {
            $this->command?->warn('Missing Badminton sport/court — run SportsSeeder/VenueSeeder first.');

            return;
        }

        // Deliberately a DIFFERENT 8 players than SwissBadmintonTournamentSeeder's
        // orderBy('id')->limit(8) slice (offset past them) so the two Swiss
        // Badminton demo tournaments don't field an identical roster.
        $players = User::role('player')->orderBy('id')->skip(8)->limit(8)->get();

        if ($players->count() < 8) {
            $this->command?->warn("Need 8 more player accounts beyond the first 8 — found {$players->count()}. Run ExtendedTournamentsSeeder/MalePlayerTopUpSeeder first.");

            return;
        }

        $bracketService = app(BracketService::class);

        $tournament = Tournament::create([
            'organizer_id' => $facilitator->id,
            'name' => 'Binangonan Facilitator Swiss Badminton Open',
            'sport_id' => $sport->id,
            'format' => 'swiss',
            'starts_at' => now()->subDays(10),
            'ends_at' => now()->subDays(6),
            'venue_id' => $gymnasium->id,
            'venue_organizer_id' => $facilitator->id,
            'livestream_organizer_id' => $facilitator->id,
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

        // All 4 rounds played — round 4's last completion is what actually
        // triggers completeTournament() inside advanceWinner()/
        // maybeAdvanceSwissRound(), so $tournament->status flips to
        // 'completed' (and champion_id gets set) without this seeder ever
        // touching either field itself.
        foreach ([1, 2, 3, 4] as $round) {
            $matches = GameMatch::where('bracket_id', $bracket->id)->where('bracket_type', 'swiss')->where('round', $round)->orderBy('id')->get();
            foreach ($matches as $match) {
                $this->simulateDetailedMatch($match, $bracketService, $tournament, $court->id);
            }
        }

        $tournament->refresh();
        $championName = User::find($tournament->champion_id)?->name;

        $this->command?->info("Seeded '{$tournament->name}' (id {$tournament->id}) — swiss, {$players->count()} players, all 4 rounds completed, champion: ".($championName ?? 'none'));
    }

    private function simulateDetailedMatch(GameMatch $match, BracketService $bracketService, Tournament $tournament, int $courtId): void
    {
        [$sets, $setsWonA, $setsWonB] = $this->playSets($tournament->sets_to_win ?? 2);

        $match->update([
            'sets' => $sets,
            'score_a' => $setsWonA,
            'score_b' => $setsWonB,
            'status' => 'completed',
            'winner_id' => $setsWonA > $setsWonB ? $match->participant_a_id : $match->participant_b_id,
            'scheduled_at' => now()->subHours(rand(24, 220)),
            'court_id' => $courtId,
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
