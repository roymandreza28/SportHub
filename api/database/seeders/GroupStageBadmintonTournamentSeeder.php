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

// A main-organizer Badminton Singles tournament in GROUP_STAGE format. 8
// individual players -> BracketService::generateGroupStage()'s
// ceil(count/4) group count splits them into 2 groups of 4 — a full round
// robin within each group, then the top 2 finishers from each group
// advance into a real 4-player single-elimination knockout (semis, then
// final), cross-seeded so a group's own top 2 don't immediately rematch
// in the semis. Every group match AND both semifinals are completed with
// full best-of-3-sets scorelines and individual player stats;
// BracketService::maybeStartGroupKnockout() auto-generates and auto-seeds
// the knockout the instant the last group match completes. The final is
// left scheduled — "already at the final" without the tournament actually
// being over, same framing as every sibling seeder in this file group.
// Leaving sport_format_id unset is what makes this an individual (not
// team) tournament throughout the system — see
// BracketService::generate()'s isTeamTournament flag.
class GroupStageBadmintonTournamentSeeder extends Seeder
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
            'name' => 'Binangonan Group Stage Badminton Cup',
            'sport_id' => $sport->id,
            'format' => 'group_stage',
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

        // Both groups' round-robin matches — completing the last one
        // triggers BracketService::maybeStartGroupKnockout(), which
        // auto-generates and auto-seeds the knockout semis from the
        // groups' final standings.
        $groupMatches = GameMatch::where('bracket_id', $bracket->id)->whereNotNull('group_number')->orderBy('id')->get();
        foreach ($groupMatches as $match) {
            $this->simulateDetailedMatch($match, $bracketService, $tournament);
        }

        // Knockout stage — auto-generated above as a real semis-then-final
        // bracket. Complete the semis, leave the final scheduled.
        $knockoutMatches = GameMatch::where('bracket_id', $bracket->id)->whereNull('group_number')->orderBy('round')->orderBy('id')->get();
        $finalRound = $knockoutMatches->max('round');

        foreach ($knockoutMatches->where('round', '<', $finalRound) as $match) {
            $this->simulateDetailedMatch($match, $bracketService, $tournament);
        }

        GameMatch::where('bracket_id', $bracket->id)->where('round', $finalRound)
            ->update(['scheduled_at' => now()->addMinutes(10), 'court_id' => $court->id]);

        $this->command?->info("Seeded '{$tournament->name}' (id {$tournament->id}) — group stage, {$players->count()} players (2 groups), group round and semis completed with full scorelines/player stats, final pending.");
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
