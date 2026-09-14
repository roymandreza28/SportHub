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

// A single, fully-detailed Basketball 5v5 tournament: 8 teams, each
// captained by one of the 8 coach accounts already in the database, rosters
// built by round-robin distributing every player account already in the
// database (no player repeated across two teams). Single-elimination, now
// sitting at the Final — every prior round (quarterfinals + semifinals) is
// completed with a real, internally-consistent box score per player
// (made/attempted shots, boards, assists/steals/blocks/turnovers, fouls),
// the same numbers mirrored into a locked coach stat sheet per team, a
// running MatchEvent point-log for each game, and the organizer-tracked
// subset (points/rebounds/fouls + FT/2PT/3PT-made, see PlayerStatFieldSets)
// landing in MatchPlayerStat so it rolls up into each player's career-stats
// pentagon and win/loss record exactly like a real completed tournament
// would. The Final is left scheduled, not completed — "already in the
// finals" without the tournament actually being over.
class FullDetailBasketballTournamentSeeder extends Seeder
{
    // The 8 flagship-style coach accounts already seeded by
    // ExtendedTournamentsSeeder — reused rather than inventing new ones.
    private const COACH_EMAILS = [
        'coach1@sporthub.test', 'coach2@sporthub.test', 'coach3@sporthub.test', 'coach4@sporthub.test',
        'coach5@sporthub.test', 'coach6@sporthub.test', 'coach7@sporthub.test', 'coach8@sporthub.test',
    ];

    private const TEAM_NAMES = [
        'Layunan Hawks', 'Poblacion Titans', 'Bilibiran Gladiators', 'Calumpang Marksmen',
        'Macamot Sharks', 'Bombong Blazers', 'Tagpos Lions', 'Pantok Crushers',
    ];

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
        $players = User::role('player')->orderBy('id')->get();

        if ($coaches->count() < 8 || $players->isEmpty()) {
            $this->command?->warn("Need 8 coach accounts and at least 1 player account — found {$coaches->count()} coaches and {$players->count()} players. Run RolesAndPermissionsSeeder/ExtendedTournamentsSeeder first.");

            return;
        }

        $bracketService = app(BracketService::class);

        // Round-robin so every player lands on exactly one of the 8
        // rosters — no repeats, and every player account gets used.
        $rosters = array_fill(0, 8, []);
        foreach ($players->values() as $i => $player) {
            $rosters[$i % 8][] = $player;
        }

        $tournament = Tournament::create([
            'organizer_id' => $organizer->id,
            'name' => 'Binangonan 5v5 Basketball Invitational',
            'sport_id' => $sport->id,
            'sport_format_id' => $format->id,
            'format' => 'single_elimination',
            'starts_at' => now()->subDays(4),
            'venue_id' => $gymnasium->id,
            'venue_organizer_id' => $venueOrganizer->id,
            'livestream_organizer_id' => $livestreamOrganizer?->id,
            'status' => 'ongoing',
            'scoring_type' => 'single_score',
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

        // Quarterfinals: all 4 played out with a full per-player box score.
        $quarterfinals = GameMatch::where('bracket_id', $bracket->id)->where('round', 1)->orderBy('id')->get();
        foreach ($quarterfinals as $match) {
            $this->simulateDetailedMatch($match, $bracketService);
        }

        // Semifinals: both played out too — the tournament is now sitting
        // right at the final, with every prior round fully detailed.
        $semifinals = GameMatch::where('bracket_id', $bracket->id)->where('round', 2)->orderBy('id')->get();
        foreach ($semifinals as $match) {
            $this->simulateDetailedMatch($match, $bracketService);
        }

        // Final: both finalists now decided by advanceWinner() above. Left
        // scheduled (not completed) — the tournament sits right at the
        // championship game, with every prior round fully detailed.
        GameMatch::where('bracket_id', $bracket->id)->where('round', 3)->first()
            ?->update(['scheduled_at' => now()->addMinutes(10), 'court_id' => $court->id]);

        $this->command?->info("Seeded '{$tournament->name}' (id {$tournament->id}) — 8 teams, {$players->count()} players, quarterfinals+semifinals completed with full box scores/stat sheets/match logs, final pending.");
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

    private function simulateDetailedMatch(GameMatch $match, BracketService $bracketService): void
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
            // A couple of "star" players get heavier usage than the rest —
            // a realistic shot distribution instead of an even split.
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

    // Splits the same generated numbers across the two real records a
    // completed game leaves behind: MatchPlayerStat (what the venue
    // organizer's live scoreboard would have recorded — see
    // PlayerStatFieldSets::for('Basketball')) and a locked MatchStatSheet
    // per team (the coach's full post-game box score — see
    // StatSheetFieldSets::for('Basketball')) — using identical made-shot
    // and foul figures so the two views never disagree.
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

    // Mirrors what MatchController::updateScore() writes on every real
    // scoreboard tap — one 'point' event per scoring play, each snapshotting
    // the running score at that moment — so a seeded completed match has a
    // real-looking match log instead of jumping straight from 0-0 to final.
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
