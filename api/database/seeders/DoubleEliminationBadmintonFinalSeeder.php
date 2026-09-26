<?php

namespace Database\Seeders;

use App\Models\Bracket;
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

// A venue-facilitator-hosted Badminton Singles tournament in DOUBLE_ELIMINATION
// format, left at its grand final only — same "everything but the final"
// framing as DoubleEliminationBasketballTournamentSeeder, just individual
// (Badminton Singles, sport_format_id left unset) rather than team/5v5. 4
// players is the minimum entrant count that produces a real losers bracket
// at all (see BracketService::generateDoubleElimination(), which skips it
// below 2 winners-bracket rounds) — with exactly 4, winners bracket is
// rounds 1-2, losers bracket is rounds 101-102, and playing all 4 of those
// out leaves both grand-final slots filled with the match itself untouched.
class DoubleEliminationBadmintonFinalSeeder extends Seeder
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
        $court = $gymnasium->courts()->where('name', 'Badminton Courts (Gymnasium)')->first();

        if (! $sport || ! $court) {
            $this->command?->warn('Missing Badminton sport/court — run SportsSeeder/VenueSeeder first.');

            return;
        }

        // A third, distinct slice of the player pool (past the two Swiss
        // Badminton seeders' 8+8) so none of the three new tournaments
        // share a roster.
        $players = User::role('player')->orderBy('id')->skip(16)->limit(4)->get();

        if ($players->count() < 4) {
            $this->command?->warn("Need 4 more player accounts beyond the first 16 — found {$players->count()}. Run ExtendedTournamentsSeeder/MalePlayerTopUpSeeder first.");

            return;
        }

        $bracketService = app(BracketService::class);

        $tournament = Tournament::create([
            'organizer_id' => $facilitator->id,
            'name' => 'Binangonan Facilitator Double-Elimination Badminton Cup',
            'sport_id' => $sport->id,
            'format' => 'double_elimination',
            'starts_at' => now()->subDays(2),
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

        // Winners-bracket round 1 (2 matches) — both slots already seeded
        // at generation, no byes with exactly 4 entrants.
        $this->playRound($bracket, 'winners', 1, $bracketService, $tournament, $court->id);

        // Winners-bracket round 2 — the winners-bracket final. Its winner
        // becomes the grand final's slot A; its loser drops into the
        // losers-bracket round below.
        $this->playRound($bracket, 'winners', 2, $bracketService, $tournament, $court->id);

        // Losers-bracket round 101 — the two winners-bracket round-1
        // losers play each other; the winner advances into round 102.
        $this->playRound($bracket, 'losers', 101, $bracketService, $tournament, $court->id);

        // Losers-bracket round 102 — that winner meets the winners-bracket
        // final's loser (dropped in above). This IS the losers-bracket
        // final: its winner becomes the grand final's slot B, completing
        // both finalist slots.
        $this->playRound($bracket, 'losers', 102, $bracketService, $tournament, $court->id);

        // Grand final: round 200, bracket_type 'final' — both slots are now
        // filled, but the match itself is left scheduled.
        GameMatch::where('bracket_id', $bracket->id)->where('bracket_type', 'final')->first()
            ?->update(['scheduled_at' => now()->addMinutes(30), 'court_id' => $court->id]);

        $this->command?->info("Seeded '{$tournament->name}' (id {$tournament->id}) — double elimination, {$players->count()} players, winners+losers brackets completed, grand final pending.");
    }

    private function playRound(Bracket $bracket, string $bracketType, int $round, BracketService $bracketService, Tournament $tournament, int $courtId): void
    {
        $matches = GameMatch::where('bracket_id', $bracket->id)
            ->where('bracket_type', $bracketType)
            ->where('round', $round)
            ->orderBy('id')
            ->get();

        foreach ($matches as $match) {
            $this->simulateDetailedMatch($match, $bracketService, $tournament, $courtId);
        }
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
            'scheduled_at' => now()->subHours(rand(6, 48)),
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
