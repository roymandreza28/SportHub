<?php

namespace Database\Seeders;

use App\Models\Court;
use App\Models\GameMatch;
use App\Models\MatchPlayerStat;
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

// Adds a full 8-team basketball championship (a different coach and a fully
// distinct 5-player roster per team) plus one extra tournament in every
// lifecycle status (draft/registration/preparation/completed/cancelled) that
// SampleDataSeeder's baseline doesn't already cover — everything there is
// 'ongoing'. Together the two seeders give a demo account something to look
// at in every tab: an in-progress flagship bracket, a match about to trigger
// the coach stat-sheet auto-popup, and one of each other tournament state.
class ExtendedTournamentsSeeder extends Seeder
{
    private const PLAYER_FIRST_NAMES = [
        'Jomar', 'Kim', 'Rico', 'Angelo', 'Bianca', 'Trisha', 'Dennis', 'Michelle', 'Arnel', 'Josie',
    ];

    private const PLAYER_LAST_NAMES = ['Perez', 'Lim', 'Gonzales', 'Tolentino', 'Mercado'];

    private const COACH_NAMES = [
        'Ramil Torres', 'Cristina Del Rosario', 'Bayani Santos', 'Ligaya Ramos',
        'Edgar Villanueva', 'Marissa Cruz', 'Jun Aquino', 'Precious Domingo',
    ];

    private const TEAM_NAMES = [
        'Riverside Hawks', 'Poblacion Titans', 'San Guillermo Gladiators', 'Maybancal Marksmen',
        'Sampaloc Sharks', 'Bombongan Blazers', 'Lagundi Lions', 'Cardona Crushers',
    ];

    public function run(): void
    {
        $organizer = User::where('email', 'organizer@sporthub.test')->first();
        $venueOrganizer = User::where('email', 'venue_organizer@sporthub.test')->first();
        $livestreamOrganizer = User::where('email', 'livestream_organizer@sporthub.test')->first();
        $gymnasium = Venue::where('name', 'Morong Gymnasium')->first();
        $badmintonCenter = Venue::where('name', "Tapal's Badminton Center")->first();

        if (! $organizer || ! $venueOrganizer || ! $livestreamOrganizer || ! $gymnasium) {
            return;
        }

        $basketball = Sport::where('name', 'Basketball')->first();
        $volleyball = Sport::where('name', 'Volleyball')->first();
        $badminton = Sport::where('name', 'Badminton')->first();
        $pickleball = Sport::where('name', 'Pickleball')->first();
        $tableTennis = Sport::where('name', 'Table Tennis')->first();

        $bracketService = app(BracketService::class);

        $coaches = collect(self::COACH_NAMES)->map(fn ($name, $i) => $this->makeUser(
            "coach" . ($i + 1) . "@sporthub.test", $name, 'coach'
        ))->values();

        $players = collect(range(0, 39))->map(fn ($i) => $this->makeUser(
            "player" . ($i + 21) . "@sporthub.test",
            self::PLAYER_FIRST_NAMES[$i % 10] . ' ' . self::PLAYER_LAST_NAMES[intdiv($i, 10)],
            'player'
        ))->values();

        if ($basketball) {
            $fiveVFive = SportFormat::where('sport_id', $basketball->id)->where('name', '5v5')->first();
            $mainCourt = $gymnasium->courts()->where('name', 'Main Court')->first();

            if ($fiveVFive && $mainCourt) {
                $this->seedFlagshipBasketball($organizer, $venueOrganizer, $livestreamOrganizer, $basketball, $fiveVFive, $gymnasium, $mainCourt, $coaches, $players, $bracketService);
            }

            $threeVThree = SportFormat::where('sport_id', $basketball->id)->where('name', '3v3')->first();
            if ($threeVThree && $mainCourt) {
                $this->seedCompletedThreeVThree($organizer, $venueOrganizer, $livestreamOrganizer, $basketball, $threeVThree, $gymnasium, $mainCourt, $coaches, $players, $bracketService);
            }
        }

        if ($volleyball) {
            $this->seedDraftVolleyball($organizer, $venueOrganizer, $livestreamOrganizer, $volleyball);
        }

        if ($badminton && $badmintonCenter) {
            $doubles = SportFormat::where('sport_id', $badminton->id)->where('name', 'Doubles')->first();
            if ($doubles) {
                $this->seedRegistrationBadminton($organizer, $venueOrganizer, $livestreamOrganizer, $badminton, $doubles, $badmintonCenter, $coaches, $players);
            }
        }

        if ($tableTennis) {
            $singles = SportFormat::where('sport_id', $tableTennis->id)->where('name', 'Singles')->first();
            if ($singles) {
                $this->seedPreparationTableTennis($organizer, $venueOrganizer, $livestreamOrganizer, $tableTennis, $gymnasium, $players, $bracketService);
            }
        }

        if ($pickleball && $badmintonCenter) {
            $this->seedCancelledPickleball($organizer, $venueOrganizer, $livestreamOrganizer, $pickleball, $badmintonCenter, $players);
        }
    }

    private function makeUser(string $email, string $name, string $role): User
    {
        $user = User::firstOrCreate(['email' => $email], ['name' => $name, 'password' => bcrypt('password')]);

        if ($user->name !== $name) {
            $user->update(['name' => $name]);
        }
        if (! $user->hasRole($role)) {
            $user->assignRole($role);
        }

        return $user;
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

    private function registerTeam(Tournament $tournament, Team $team): TournamentRegistration
    {
        return TournamentRegistration::create([
            'tournament_id' => $tournament->id,
            'team_id' => $team->id,
            'registered_by' => $team->captain_id,
            'status' => 'confirmed',
        ]);
    }

    // Completes a match with a plausible final score AND a full per-player
    // box score for both rosters — via MatchPlayerStat, the same table the
    // real venue-organizer scoreboards now write to live (see
    // MatchController::upsertPlayerStats()) — so every finished match in the
    // demo has "detailed scoreboard" data to show, and so player profiles'
    // career stats pentagon (ProfileController::statSummary()) has
    // something to sum.
    private function simulateTeamMatch(GameMatch $match, BracketService $bracketService, int $min = 55, int $max = 95): void
    {
        $scoreA = rand($min, $max);
        $scoreB = rand($min, $max);
        if ($scoreA === $scoreB) {
            $scoreB--;
        }

        $match->update([
            'score_a' => $scoreA,
            'score_b' => $scoreB,
            'status' => 'completed',
            'winner_team_id' => $scoreA > $scoreB ? $match->participant_a_team_id : $match->participant_b_team_id,
            'scheduled_at' => now()->subHours(rand(6, 72)),
        ]);

        $sportId = $match->bracket->tournament->sport_id;
        $this->recordPlayerStats($match, $match->participant_a_team_id, $scoreA, $sportId);
        $this->recordPlayerStats($match, $match->participant_b_team_id, $scoreB, $sportId);

        $bracketService->advanceWinner($match->fresh());
    }

    private function recordPlayerStats(GameMatch $match, ?int $teamId, int $teamScore, int $sportId): void
    {
        if (! $teamId) {
            return;
        }

        $team = Team::with(['members' => fn ($q) => $q->where('status', 'accepted')])->find($teamId);
        $memberIds = $team?->members->pluck('user_id')->values() ?? collect();
        if ($memberIds->isEmpty()) {
            return;
        }

        $points = $this->distributePoints($teamScore, $memberIds->count());

        foreach ($memberIds as $i => $userId) {
            MatchPlayerStat::updateOrCreate(
                ['match_id' => $match->id, 'user_id' => $userId],
                [
                    'team_id' => $teamId,
                    'sport_id' => $sportId,
                    'stats' => [
                        'points' => $points[$i],
                        'rebounds' => rand(0, 12),
                        'assists' => rand(0, 8),
                        'steals' => rand(0, 5),
                        'blocks' => rand(0, 4),
                        'fouls' => rand(0, 4),
                    ],
                ]
            );
        }
    }

    // Splits a team's final score across its roster with a realistic
    // "one or two lead scorers, everyone else contributes less" shape,
    // rather than an even split — random per-player weights, floored, with
    // any rounding remainder landing on the top-weighted (effectively
    // top-scoring) player so the total always reconciles exactly to the
    // team's real score.
    private function distributePoints(int $total, int $count): array
    {
        if ($count <= 0) {
            return [];
        }
        if ($total <= 0) {
            return array_fill(0, $count, 0);
        }

        $weights = array_map(fn () => rand(2, 10), range(1, $count));
        $weightSum = array_sum($weights);
        $points = array_map(fn ($w) => (int) floor($total * $w / $weightSum), $weights);
        $topIndex = array_search(max($weights), $weights, true);
        $points[$topIndex] += $total - array_sum($points);

        return $points;
    }

    /** @param  Collection<int, User>  $coaches
     *  @param  Collection<int, User>  $players */
    private function seedFlagshipBasketball(
        User $organizer, User $venueOrganizer, User $livestreamOrganizer,
        Sport $sport, SportFormat $format, Venue $venue, Court $court,
        Collection $coaches, Collection $players, BracketService $bracketService,
    ): void {
        $tournament = Tournament::create([
            'organizer_id' => $organizer->id,
            'name' => 'Morong Interbarangay Basketball Championship',
            'sport_id' => $sport->id,
            'sport_format_id' => $format->id,
            'format' => 'single_elimination',
            'starts_at' => now()->subDays(3),
            'venue_id' => $venue->id,
            'venue_organizer_id' => $venueOrganizer->id,
            'livestream_organizer_id' => $livestreamOrganizer->id,
            'status' => 'ongoing',
            'scoring_type' => 'single_score',
        ]);

        foreach (self::TEAM_NAMES as $i => $teamName) {
            $roster = $players->slice($i * 5, 5)->values();
            $team = $this->makeTeam($sport, $format, $coaches[$i], $teamName, $roster);
            $this->registerTeam($tournament, $team);
        }

        $bracket = $bracketService->generate($tournament);

        // Quarterfinals: all 4 played out, each with a full per-player box
        // score for both rosters.
        $round1 = GameMatch::where('bracket_id', $bracket->id)->where('round', 1)->orderBy('id')->get();
        foreach ($round1 as $match) {
            $this->simulateTeamMatch($match, $bracketService, 60, 95);
        }

        // Semifinals: both played out too — the tournament is now sitting
        // right at the final, with every prior round fully detailed.
        $round2 = GameMatch::where('bracket_id', $bracket->id)->where('round', 2)->orderBy('id')->get();
        foreach ($round2 as $match) {
            $this->simulateTeamMatch($match, $bracketService, 60, 95);
        }

        // Final: both finalists are now decided by advanceWinner() above.
        // Scheduled just inside the coach stat-sheet's 10-minute auto-popup
        // window so logging in as either finalist's coach demonstrates the
        // live trigger for the championship game itself.
        GameMatch::where('bracket_id', $bracket->id)->where('round', 3)->first()
            ?->update(['scheduled_at' => now()->addMinutes(8), 'court_id' => $court->id]);
    }

    private function seedCompletedThreeVThree(
        User $organizer, User $venueOrganizer, User $livestreamOrganizer,
        Sport $sport, SportFormat $format, Venue $venue, Court $court,
        Collection $coaches, Collection $players, BracketService $bracketService,
    ): void {
        $tournament = Tournament::create([
            'organizer_id' => $organizer->id,
            'name' => 'Morong Rizal Day 3x3 Cup',
            'sport_id' => $sport->id,
            'sport_format_id' => $format->id,
            'format' => 'single_elimination',
            'starts_at' => now()->subWeek(),
            'ends_at' => now()->subWeek()->addHours(3),
            'venue_id' => $venue->id,
            'venue_organizer_id' => $venueOrganizer->id,
            'livestream_organizer_id' => $livestreamOrganizer->id,
            'status' => 'ongoing',
            'scoring_type' => 'single_score',
        ]);

        $teamA = $this->makeTeam($sport, $format, $coaches[0], 'Downtown Ballers', $players->slice(0, 3)->values());
        $teamB = $this->makeTeam($sport, $format, $coaches[1], 'Uptown Runners', $players->slice(3, 3)->values());
        $this->registerTeam($tournament, $teamA);
        $this->registerTeam($tournament, $teamB);

        $bracket = $bracketService->generate($tournament);
        $final = GameMatch::where('bracket_id', $bracket->id)->first();
        $this->simulateTeamMatch($final, $bracketService, 15, 21);
    }

    private function seedDraftVolleyball(User $organizer, User $venueOrganizer, User $livestreamOrganizer, Sport $sport): void
    {
        $sixVSix = SportFormat::where('sport_id', $sport->id)->where('name', '6v6')->first();

        Tournament::create([
            'organizer_id' => $organizer->id,
            'name' => 'Morong Volleyball Rookie League',
            'sport_id' => $sport->id,
            'sport_format_id' => $sixVSix?->id,
            'format' => 'round_robin',
            'starts_at' => now()->addMonth(),
            'venue_organizer_id' => $venueOrganizer->id,
            'livestream_organizer_id' => $livestreamOrganizer->id,
            'status' => 'draft',
            'scoring_type' => 'best_of_sets',
            'sets_to_win' => 3,
        ]);
    }

    /** @param  Collection<int, User>  $coaches
     *  @param  Collection<int, User>  $players */
    private function seedRegistrationBadminton(
        User $organizer, User $venueOrganizer, User $livestreamOrganizer,
        Sport $sport, SportFormat $format, Venue $venue, Collection $coaches, Collection $players,
    ): void {
        $tournament = Tournament::create([
            'organizer_id' => $organizer->id,
            'name' => "Tapal's Badminton Barangay Open",
            'sport_id' => $sport->id,
            'sport_format_id' => $format->id,
            'format' => 'single_elimination',
            'starts_at' => now()->addWeeks(2),
            'venue_id' => $venue->id,
            'venue_organizer_id' => $venueOrganizer->id,
            'livestream_organizer_id' => $livestreamOrganizer->id,
            'status' => 'registration',
            'scoring_type' => 'best_of_sets',
            'sets_to_win' => 2,
        ]);

        $teamA = $this->makeTeam($sport, $format, $coaches[2], 'Smash Sisters', $players->slice(10, 2)->values());
        $teamB = $this->makeTeam($sport, $format, $coaches[3], 'Rally Raiders', $players->slice(12, 2)->values());
        $this->registerTeam($tournament, $teamA);
        $this->registerTeam($tournament, $teamB);
    }

    /** @param  Collection<int, User>  $players */
    private function seedPreparationTableTennis(
        User $organizer, User $venueOrganizer, User $livestreamOrganizer,
        Sport $sport, Venue $venue, Collection $players, BracketService $bracketService,
    ): void {
        $tournament = Tournament::create([
            'organizer_id' => $organizer->id,
            'name' => 'Morong Table Tennis Singles Invitational',
            'sport_id' => $sport->id,
            'format' => 'single_elimination',
            'starts_at' => now()->addDays(4),
            'venue_id' => $venue->id,
            'venue_organizer_id' => $venueOrganizer->id,
            'livestream_organizer_id' => $livestreamOrganizer->id,
            'status' => 'registration',
            'scoring_type' => 'best_of_sets',
            'sets_to_win' => 3,
        ]);

        foreach ($players->slice(14, 4) as $registrant) {
            TournamentRegistration::create([
                'tournament_id' => $tournament->id,
                'user_id' => $registrant->id,
                'registered_by' => $registrant->id,
                'status' => 'confirmed',
            ]);
        }

        // Bracket generated (this is what actually flips status to
        // 'preparation') but nobody's played yet — a realistic "ready to
        // kick off, waiting on the organizer to hit proceed" snapshot.
        $bracketService->generate($tournament);
        $tournament->update(['status' => 'preparation']);
    }

    /** @param  Collection<int, User>  $players */
    private function seedCancelledPickleball(
        User $organizer, User $venueOrganizer, User $livestreamOrganizer,
        Sport $sport, Venue $venue, Collection $players,
    ): void {
        $tournament = Tournament::create([
            'organizer_id' => $organizer->id,
            'name' => 'Morong Rainy Season Pickleball Meet',
            'sport_id' => $sport->id,
            'format' => 'single_elimination',
            'starts_at' => now()->subDays(2),
            'venue_id' => $venue->id,
            'venue_organizer_id' => $venueOrganizer->id,
            'livestream_organizer_id' => $livestreamOrganizer->id,
            'status' => 'registration',
            'scoring_type' => 'best_of_sets',
            'sets_to_win' => 2,
        ]);

        foreach ($players->slice(18, 3) as $registrant) {
            TournamentRegistration::create([
                'tournament_id' => $tournament->id,
                'user_id' => $registrant->id,
                'registered_by' => $registrant->id,
                'status' => 'confirmed',
            ]);
        }

        // Weather forced this one to be called off before a bracket ever
        // got generated — the real cancel() endpoint only allows this from
        // registration/preparation, matched here even though this is a
        // direct Eloquent write.
        $tournament->update(['status' => 'cancelled']);
    }
}
