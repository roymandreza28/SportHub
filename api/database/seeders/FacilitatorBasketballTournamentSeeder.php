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

// A Basketball 5v5 tournament organized BY a venue facilitator, at one of
// their own registered venues — exercising the "venue facilitators fill
// the venue/livestream organizer roles themselves" feature end to end
// (venue_organizer_id/livestream_organizer_id both the facilitator's own
// id, exactly what TournamentController::store() now auto-assigns for a
// real facilitator-created tournament). Only 4 teams (a semifinal-into-
// final bracket, not the flagship's quarterfinal-sized 8) — the semifinal
// (round 1) is completed with a full box score/stat sheet/match log per
// game, same detail level as FullDetailBasketballTournamentSeeder; the
// final (round 2) is left scheduled, so the tournament sits "already in
// the finals" without actually being over.
class FacilitatorBasketballTournamentSeeder extends Seeder
{
    private const COACH_EMAILS = ['coach1@sporthub.test', 'coach2@sporthub.test', 'coach3@sporthub.test', 'coach4@sporthub.test'];

    // Distinct from FullDetailBasketballTournamentSeeder's 8 team names —
    // this is a separate tournament, not a continuation of that one.
    private const TEAM_NAMES = ['Darangan Ballers', 'Kinaboogan Kings', 'Flordeliza Flames', 'Palangoy Panthers'];

    public function run(): void
    {
        $facilitator = User::where('email', 'venue_facilitator@sporthub.test')->first();

        if (! $facilitator) {
            $this->command?->warn('Missing venue_facilitator@sporthub.test — run RolesAndPermissionsSeeder/DatabaseSeeder first.');

            return;
        }

        $venue = Venue::where('facilitator_id', $facilitator->id)
            ->where('name', 'Binangonan Recreation and Conference Center (BRCC)')
            ->first() ?? Venue::where('facilitator_id', $facilitator->id)->first();

        if (! $venue) {
            $this->command?->warn('venue_facilitator@sporthub.test has no registered venues — run VenueSeeder first.');

            return;
        }

        $court = $venue->courts()->where('name', 'Main Court')->first() ?? $venue->courts()->first();
        $sport = Sport::where('name', 'Basketball')->first();
        $format = $sport ? SportFormat::where('sport_id', $sport->id)->where('name', '5v5')->first() : null;

        if (! $court || ! $sport || ! $format) {
            $this->command?->warn('Missing a court at that venue, or Basketball 5v5 sport/format — run SportsSeeder/VenueSeeder first.');

            return;
        }

        $coaches = collect(self::COACH_EMAILS)->map(fn ($email) => User::where('email', $email)->first())->filter()->values();
        $players = User::role('player')->orderBy('id')->limit(20)->get();

        if ($coaches->count() < 4 || $players->count() < 20) {
            $this->command?->warn("Need 4 coach accounts and 20 player accounts — found {$coaches->count()} coaches and {$players->count()} players. Run ExtendedTournamentsSeeder first.");

            return;
        }

        $bracketService = app(BracketService::class);

        // Round-robin so every one of the 20 players lands on exactly one
        // of the 4 rosters — no repeats.
        $rosters = array_fill(0, 4, []);
        foreach ($players->values() as $i => $player) {
            $rosters[$i % 4][] = $player;
        }

        $tournament = Tournament::create([
            'organizer_id' => $facilitator->id,
            'name' => 'BRCC Facilitator Cup',
            'sport_id' => $sport->id,
            'sport_format_id' => $format->id,
            'format' => 'single_elimination',
            'starts_at' => now()->subDays(2),
            'venue_id' => $venue->id,
            // A venue facilitator has no separate staff to assign — they
            // fill both jobs themselves, same as TournamentController::
            // store() now auto-assigns for a real facilitator-created
            // tournament (this seeder seeds the same end state directly
            // rather than going through the HTTP endpoint).
            'venue_organizer_id' => $facilitator->id,
            'livestream_organizer_id' => $facilitator->id,
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

        // Semifinals: both played out with a full per-player box score —
        // the tournament now sits right at the final.
        $semifinals = GameMatch::where('bracket_id', $bracket->id)->where('round', 1)->orderBy('id')->get();
        foreach ($semifinals as $match) {
            $this->simulateDetailedMatch($match, $bracketService);
        }

        // Final: both finalists now decided by advanceWinner() above. Left
        // scheduled (not completed).
        GameMatch::where('bracket_id', $bracket->id)->where('round', 2)->first()
            ?->update(['scheduled_at' => now()->addMinutes(10), 'court_id' => $court->id]);

        $this->command?->info("Seeded '{$tournament->name}' (id {$tournament->id}) at {$venue->name} — 4 teams organized by {$facilitator->name}, semifinal completed with full box scores/stat sheets/match logs, final pending.");
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
