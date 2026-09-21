<?php

namespace Database\Seeders;

use App\Models\GameMatch;
use App\Models\MatchEvent;
use App\Models\MatchPlayerStat;
use App\Models\MatchStatSheet;
use App\Models\Sport;
use App\Models\SportFormat;
use App\Models\Team;
use App\Models\Tournament;
use App\Models\TournamentRegistration;
use App\Models\User;
use App\Models\Venue;
use App\Services\BracketService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;

// Sibling of CompletedMensBasketballFinalsSeeder — same shape (men's-only
// Basketball 5v5, 4 teams, single elimination, every round including the
// final completed with full box score/stat sheet/match log detail, ending
// with a crowned champion), but built from a completely different set of
// participants: coaches 5-8 instead of 1-4, and the NEXT 20 male players
// (by id) instead of the first 20, so the two tournaments never share a
// coach or a player.
class CompletedMensBasketballShowdownSeeder extends Seeder
{
    private const COACH_EMAILS = ['coach5@sporthub.test', 'coach6@sporthub.test', 'coach7@sporthub.test', 'coach8@sporthub.test'];

    private const TEAM_NAMES = ['Bombong Brahmas', 'Tatala Titans', 'Batingan Barracudas', 'Pantok Pirates'];

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

        $sport = Sport::where('name', 'Basketball')->first();
        $format = $sport ? SportFormat::where('sport_id', $sport->id)->where('name', '5v5')->first() : null;
        $court = $gymnasium->courts()->where('name', 'Main Court')->first();

        if (! $sport || ! $format || ! $court) {
            $this->command?->warn('Missing Basketball 5v5 sport/format/court — run SportsSeeder/VenueSeeder first.');

            return;
        }

        $coaches = collect(self::COACH_EMAILS)->map(fn ($email) => User::where('email', $email)->first())->filter()->values();
        // Skip the first 20 male players — those went to
        // CompletedMensBasketballFinalsSeeder — so the two tournaments have
        // genuinely different rosters.
        $players = User::role('player')->where('gender', 'male')->orderBy('id')->skip(20)->limit(20)->get();

        if ($coaches->count() < 4 || $players->count() < 20) {
            $this->command?->warn("Need 4 coach accounts and 20 more male player accounts (beyond the first 20) — found {$coaches->count()} coaches and {$players->count()} male players. Run ExtendedTournamentsSeeder/MalePlayerTopUpSeeder first.");

            return;
        }

        $bracketService = app(BracketService::class);

        $rosters = array_fill(0, 4, []);
        foreach ($players->values() as $i => $player) {
            $rosters[$i % 4][] = $player;
        }

        $tournament = Tournament::create([
            'organizer_id' => $organizer->id,
            'name' => 'Binangonan Barangay Basketball Showdown',
            'sport_id' => $sport->id,
            'sport_format_id' => $format->id,
            'format' => 'single_elimination',
            'starts_at' => now()->subDays(6),
            'venue_id' => $gymnasium->id,
            'venue_organizer_id' => $venueOrganizer->id,
            'livestream_organizer_id' => $livestreamOrganizer?->id,
            'status' => 'ongoing',
            'scoring_type' => 'single_score',
            'required_gender' => 'male',
        ]);

        foreach (self::TEAM_NAMES as $i => $teamName) {
            $roster = collect($rosters[$i]);
            $team = $this->makeTeam($sport, $format, $coaches[$i], $teamName, $roster);

            TournamentRegistration::create([
                'tournament_id' => $tournament->id,
                'team_id' => $team->id,
                'registered_by' => $team->captain_id,
                'status' => 'confirmed',
            ]);
        }

        $bracket = $bracketService->generate($tournament);

        $semifinals = GameMatch::where('bracket_id', $bracket->id)->where('round', 1)->orderBy('id')->get();
        foreach ($semifinals as $match) {
            $this->simulateDetailedMatch($match, $bracketService, $court->id);
        }

        $final = GameMatch::where('bracket_id', $bracket->id)->where('round', 2)->first();
        if ($final) {
            $this->simulateDetailedMatch($final, $bracketService, $court->id);
        }

        $tournament->refresh();
        $championName = $tournament->champion_team_id ? Team::find($tournament->champion_team_id)?->name : null;

        $this->command?->info("Seeded '{$tournament->name}' (id {$tournament->id}) — 4 teams, {$players->count()} male players, every round completed with full box scores/stat sheets/match logs. Champion: {$championName}.");
    }

    /** @param  Collection<int, User>  $roster */
    private function makeTeam(Sport $sport, SportFormat $format, User $captain, string $name, Collection $roster): Team
    {
        $team = Team::create([
            'sport_id' => $sport->id,
            'sport_format_id' => $format->id,
            'captain_id' => $captain->id,
            'name' => $name,
            'status' => 'forming',
        ]);

        foreach ($roster as $member) {
            $team->members()->create(['user_id' => $member->id, 'status' => 'accepted', 'responded_at' => now()]);
        }

        $team->refreshReadyStatus();

        return $team;
    }

    private function simulateDetailedMatch(GameMatch $match, BracketService $bracketService, int $courtId): void
    {
        $teamA = Team::with(['members' => fn ($q) => $q->where('status', 'accepted')])->find($match->participant_a_team_id);
        $teamB = Team::with(['members' => fn ($q) => $q->where('status', 'accepted')])->find($match->participant_b_team_id);

        $boxA = $this->generateBoxScore($teamA);
        $boxB = $this->generateBoxScore($teamB);
        $scoreA = collect($boxA)->sum('points');
        $scoreB = collect($boxB)->sum('points');
        if ($scoreA === $scoreB) {
            $scoreA++;
        }

        $match->update([
            'score_a' => $scoreA,
            'score_b' => $scoreB,
            'status' => 'completed',
            'winner_team_id' => $scoreA > $scoreB ? $teamA->id : $teamB->id,
            'scheduled_at' => now()->subHours(rand(24, 96)),
            'court_id' => $courtId,
        ]);

        $this->persistBoxScore($match, $teamA, $boxA);
        $this->persistBoxScore($match, $teamB, $boxB);
        $this->simulatePointLog($match, $scoreA, $scoreB);

        $bracketService->advanceWinner($match->fresh());
    }

    /** @return array<int, array<string, int>> keyed by user_id */
    private function generateBoxScore(Team $team): array
    {
        $rows = [];

        foreach ($team->members->values() as $i => $member) {
            $usage = $i < 2 ? rand(10, 16) : rand(4, 9);
            $fg2Att = max(1, (int) round($usage * 0.65));
            $fg2Made = rand(0, $fg2Att);
            $fg3Att = max(0, $usage - $fg2Att);
            $fg3Made = $fg3Att > 0 ? rand(0, $fg3Att) : 0;
            $ftAtt = rand(0, 6);
            $ftMade = $ftAtt > 0 ? rand(0, $ftAtt) : 0;

            $rows[$member->user_id] = [
                'points' => $fg2Made * 2 + $fg3Made * 3 + $ftMade,
                'fg2_att' => $fg2Att, 'fg2_made' => $fg2Made,
                'fg3_att' => $fg3Att, 'fg3_made' => $fg3Made,
                'ft_att' => $ftAtt, 'ft_made' => $ftMade,
                'reb_off' => rand(0, 4), 'reb_def' => rand(1, 8),
                'assists' => rand(0, 7), 'steals' => rand(0, 4), 'blocks' => rand(0, 3),
                'turnovers' => rand(0, 5), 'fouls' => rand(0, 4),
            ];
        }

        return $rows;
    }

    private function persistBoxScore(GameMatch $match, Team $team, array $rows): void
    {
        $sportId = $match->bracket->tournament->sport_id;

        foreach ($rows as $userId => $row) {
            MatchPlayerStat::updateOrCreate(
                ['match_id' => $match->id, 'user_id' => $userId],
                ['team_id' => $team->id, 'sport_id' => $sportId, 'stats' => [
                    'points' => $row['points'],
                    'rebounds' => $row['reb_off'] + $row['reb_def'],
                    'fouls' => $row['fouls'],
                    'ft_made' => $row['ft_made'],
                    'fg2_made' => $row['fg2_made'],
                    'fg3_made' => $row['fg3_made'],
                ]]
            );
        }

        $names = User::whereIn('id', array_keys($rows))->pluck('name', 'id');
        $coachName = User::find($team->captain_id)?->name;

        $sheetRows = collect($rows)->map(fn ($row, $userId) => [
            'player_id' => $userId,
            'name' => $names[$userId] ?? '',
            'jersey_number' => (string) rand(0, 99),
            'notes' => '',
            'stats' => array_diff_key($row, ['points' => 0]),
        ])->values()->all();

        MatchStatSheet::updateOrCreate(
            ['match_id' => $match->id, 'team_id' => $team->id],
            [
                'user_id' => null,
                'sport_id' => $sportId,
                'filled_by_user_id' => $team->captain_id,
                'is_locked' => true,
                'locked_at' => now(),
                'data' => [
                    'rows' => $sheetRows,
                    'further_comments' => 'Solid team effort — full box score logged post-game.',
                    'recorded_by' => $coachName,
                    'signed' => $coachName,
                ],
            ]
        );
    }

    private function simulatePointLog(GameMatch $match, int $finalScoreA, int $finalScoreB): void
    {
        $remainingA = $finalScoreA;
        $remainingB = $finalScoreB;
        $scoreA = 0;
        $scoreB = 0;
        $events = [];

        while ($remainingA > 0 || $remainingB > 0) {
            $side = $remainingA > 0 && ($remainingB === 0 || rand(0, 1) === 0) ? 'a' : 'b';
            $remaining = $side === 'a' ? $remainingA : $remainingB;
            $delta = min($remaining, rand(1, 3));

            if ($side === 'a') {
                $scoreA += $delta;
                $remainingA -= $delta;
            } else {
                $scoreB += $delta;
                $remainingB -= $delta;
            }

            $events[] = [
                'match_id' => $match->id,
                'type' => 'point',
                'payload' => json_encode(['score_a' => $scoreA, 'score_b' => $scoreB]),
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }

        MatchEvent::insert($events);
    }
}
