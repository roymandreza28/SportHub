<?php

namespace Database\Seeders;

use App\Models\PlayerProfile;
use App\Models\Sport;
use App\Models\SportFormat;
use App\Models\Team;
use App\Models\Tournament;
use App\Models\TournamentRegistration;
use App\Models\User;
use App\Models\Venue;
use App\Services\BracketService;
use Illuminate\Database\Seeder;

class SampleDataSeeder extends Seeder
{
    public function run(): void
    {
        $facilitator = User::where('email', 'venue_facilitator@sporthub.test')->first();
        $player = User::where('email', 'player@sporthub.test')->first();
        $coach = User::where('email', 'coach@sporthub.test')->first();
        $organizer = User::where('email', 'organizer@sporthub.test')->first();
        $venueOrganizer = User::where('email', 'venue_organizer@sporthub.test')->first();

        if (! $facilitator || ! $player || ! $coach) {
            return;
        }

        $basketball = Sport::where('name', 'Basketball')->first();
        $volleyball = Sport::where('name', 'Volleyball')->first();
        $badminton = Sport::where('name', 'Badminton')->first();
        $pickleball = Sport::where('name', 'Pickleball')->first();
        $tableTennis = Sport::where('name', 'Table Tennis')->first();
        $tennis = Sport::where('name', 'Tennis')->first();

        // Real, named facility in Morong proper — a multi-purpose covered
        // gymnasium, the standard Philippine barangay/municipal venue for
        // both basketball and volleyball.
        $gymnasium = Venue::firstOrCreate(
            ['facilitator_id' => $facilitator->id, 'name' => 'Morong Gymnasium'],
            [
                'address' => 'Brgy. Poblacion, Morong, Rizal',
                'latitude' => 14.5192,
                'longitude' => 121.2331,
                'description' => 'Municipal gymnasium in Morong proper — basketball and volleyball.',
                'amenities' => ['parking', 'lockers', 'restrooms'],
            ]
        );

        $mainCourt = $gymnasium->courts()->firstOrCreate(
            ['name' => 'Main Court'],
            ['type' => 'court', 'capacity' => 30, 'status' => 'active']
        );
        if ($basketball) {
            $mainCourt->sports()->syncWithoutDetaching([$basketball->id]);
        }

        $volleyballCourt = $gymnasium->courts()->firstOrCreate(
            ['name' => 'Volleyball Court'],
            ['type' => 'court', 'capacity' => 24, 'status' => 'active']
        );
        if ($volleyball) {
            $volleyballCourt->sports()->syncWithoutDetaching([$volleyball->id]);
        }

        $gymnasium->equipment()->firstOrCreate(
            ['name' => 'Basketballs'],
            ['quantity_total' => 20, 'quantity_available' => 20]
        );

        // Table tennis gets a table set up in a corner of the same
        // multi-purpose gymnasium rather than its own venue.
        $tableTennisCourt = $gymnasium->courts()->firstOrCreate(
            ['name' => 'Table Tennis Corner'],
            ['type' => 'court', 'capacity' => 8, 'status' => 'active']
        );
        if ($tableTennis) {
            $tableTennisCourt->sports()->syncWithoutDetaching([$tableTennis->id]);
        }

        // Real, named badminton facility in Barangay Maybancal.
        $badmintonCenter = Venue::firstOrCreate(
            ['facilitator_id' => $facilitator->id, 'name' => "Tapal's Badminton Center"],
            [
                'address' => 'Brgy. Maybancal, Morong, Rizal',
                'latitude' => 14.5170,
                'longitude' => 121.2450,
                'description' => 'Dedicated badminton courts in Barangay Maybancal.',
                'amenities' => ['parking'],
            ]
        );

        $badmintonCourt = $badmintonCenter->courts()->firstOrCreate(
            ['name' => 'Court 1'],
            ['type' => 'court', 'capacity' => 8, 'status' => 'active']
        );
        if ($badminton) {
            $badmintonCourt->sports()->syncWithoutDetaching([$badminton->id]);
        }

        // Pickleball shares the racket-sports facility rather than getting
        // its own venue — a second, dedicated court there.
        $pickleballCourt = $badmintonCenter->courts()->firstOrCreate(
            ['name' => 'Court 2'],
            ['type' => 'court', 'capacity' => 8, 'status' => 'active']
        );
        if ($pickleball) {
            $pickleballCourt->sports()->syncWithoutDetaching([$pickleball->id]);
        }

        // Tennis gets its own outdoor hard-court venue — unlike the other
        // racket sports here, it's not something you'd share a badminton
        // hall or gym corner with.
        $tennisCourts = Venue::firstOrCreate(
            ['facilitator_id' => $facilitator->id, 'name' => 'Morong Tennis Courts'],
            [
                'address' => 'Brgy. San Guillermo, Morong, Rizal',
                'latitude' => 14.5210,
                'longitude' => 121.2295,
                'description' => 'Outdoor hard courts in Morong.',
                'amenities' => ['parking', 'restrooms'],
            ]
        );

        $tennisCourt = $tennisCourts->courts()->firstOrCreate(
            ['name' => 'Court 1'],
            ['type' => 'court', 'capacity' => 8, 'status' => 'active']
        );
        if ($tennis) {
            $tennisCourt->sports()->syncWithoutDetaching([$tennis->id]);
        }

        PlayerProfile::firstOrCreate(
            ['user_id' => $player->id],
            [
                'bio' => 'Local recreational player.',
                'date_of_birth' => '2000-05-14',
                'primary_sport_id' => $basketball?->id,
            ]
        );

        if ($basketball) {
            $player->playerProfile->skillLevels()->firstOrCreate(
                ['sport_id' => $basketball->id],
                [
                    'coach_id' => $coach->id,
                    'level' => 'casual_player',
                    'score' => 62.5,
                    'evaluated_at' => now(),
                ]
            );
        }

        // Demo tournaments are fully regenerated on every seed run rather
        // than left to accumulate — clears out any tournament created by an
        // earlier version of this seeder (e.g. the old individual-only
        // "Basketball Cup") along with its cascaded registrations/brackets/
        // matches, so re-running `db:seed` always lands on exactly one clean
        // demo tournament.
        Tournament::query()->delete();

        // Live team tournaments for the demo venue organizer to score —
        // without these, venue_organizer@sporthub.test logs in to an empty
        // scoreboard tab with nothing assigned to them. Eleven player
        // accounts (player1..player11) plus the existing "Josef Reyes" demo
        // account are shared across every tournament's rosters — a player
        // can realistically belong to more than one team/sport at once.
        if ($organizer && $venueOrganizer && $coach && $basketball) {
            $extraPlayerNames = [
                1 => 'Marco Villareal', 2 => 'Angelica Bautista', 3 => 'Nathaniel Ramos',
                4 => 'Kristine Aquino', 5 => 'Paolo Domingo', 6 => 'Samantha Garcia',
                7 => 'Enzo Manalo', 8 => 'Julienne Castro', 9 => 'Rafael Navarro',
                10 => 'Diana Salazar', 11 => 'Christian Ocampo',
            ];

            $extraPlayers = collect(range(1, 11))->map(function (int $n) use ($extraPlayerNames) {
                $name = $extraPlayerNames[$n];
                $user = User::firstOrCreate(
                    ['email' => "player{$n}@sporthub.test"],
                    ['name' => $name, 'password' => bcrypt('password')]
                );
                if ($user->name !== $name) {
                    $user->update(['name' => $name]);
                }
                if (! $user->hasRole('player')) {
                    $user->assignRole('player');
                }

                return $user;
            });

            $fiveVFive = SportFormat::where('sport_id', $basketball->id)->where('name', '5v5')->first();

            if ($fiveVFive) {
                $this->createTeamTournament(
                    organizer: $organizer,
                    venueOrganizer: $venueOrganizer,
                    coach: $coach,
                    sport: $basketball,
                    format: $fiveVFive,
                    venue: $gymnasium,
                    name: 'Morong Barangay Basketball 5v5 Cup',
                    teams: [
                        ['Riverside Ballers', $extraPlayers->slice(0, 5)->values()],
                        ['Poblacion Hoopers', $extraPlayers->slice(5, 4)->push($player)->values()],
                    ],
                );
            }

            $threeVThree = SportFormat::where('sport_id', $basketball->id)->where('name', '3v3')->first();

            if ($threeVThree) {
                $this->createTeamTournament(
                    organizer: $organizer,
                    venueOrganizer: $venueOrganizer,
                    coach: $coach,
                    sport: $basketball,
                    format: $threeVThree,
                    venue: $gymnasium,
                    name: 'Morong 3x3 Streetball Cup',
                    teams: [
                        ['Court Kings', $extraPlayers->slice(0, 3)->values()],
                        ['Street Ballers', $extraPlayers->slice(3, 3)->values()],
                    ],
                );
            }

            if ($volleyball) {
                $sixVSix = SportFormat::where('sport_id', $volleyball->id)->where('name', '6v6')->first();

                if ($sixVSix) {
                    $this->createTeamTournament(
                        organizer: $organizer,
                        venueOrganizer: $venueOrganizer,
                        coach: $coach,
                        sport: $volleyball,
                        format: $sixVSix,
                        venue: $gymnasium,
                        name: 'Morong Barangay Volleyball 6v6 Cup',
                        teams: [
                            ['Net Ninjas', $extraPlayers->slice(0, 6)->values()],
                            ['Spike Force', $extraPlayers->slice(6, 5)->push($player)->values()],
                        ],
                        scoringType: 'best_of_sets',
                        setsToWin: 3,
                    );
                }
            }

            if ($badminton) {
                // Singles has no team structure at all — plain individual
                // registrations, same as every non-team tournament.
                $this->createIndividualTournament(
                    organizer: $organizer,
                    venueOrganizer: $venueOrganizer,
                    sport: $badminton,
                    venue: $badmintonCenter,
                    name: 'Tapal\'s Badminton Singles Open',
                    players: [$extraPlayers[6], $extraPlayers[7]],
                    scoringType: 'best_of_sets',
                    setsToWin: 2,
                );

                $doubles = SportFormat::where('sport_id', $badminton->id)->where('name', 'Doubles')->first();

                if ($doubles) {
                    $this->createTeamTournament(
                        organizer: $organizer,
                        venueOrganizer: $venueOrganizer,
                        coach: $coach,
                        sport: $badminton,
                        format: $doubles,
                        venue: $badmintonCenter,
                        name: "Tapal's Badminton Doubles Cup",
                        teams: [
                            ['Shuttle Smashers', $extraPlayers->slice(8, 2)->values()],
                            ['Net Dominators', $extraPlayers->slice(10, 1)->push($player)->values()],
                        ],
                        scoringType: 'best_of_sets',
                        setsToWin: 2,
                    );
                }
            }

            if ($pickleball) {
                $this->createIndividualTournament(
                    organizer: $organizer,
                    venueOrganizer: $venueOrganizer,
                    sport: $pickleball,
                    venue: $badmintonCenter,
                    name: "Tapal's Pickleball Singles Open",
                    players: [$extraPlayers[0], $extraPlayers[1]],
                    scoringType: 'best_of_sets',
                    setsToWin: 2,
                );

                $pickleballDoubles = SportFormat::where('sport_id', $pickleball->id)->where('name', 'Doubles')->first();

                if ($pickleballDoubles) {
                    $this->createTeamTournament(
                        organizer: $organizer,
                        venueOrganizer: $venueOrganizer,
                        coach: $coach,
                        sport: $pickleball,
                        format: $pickleballDoubles,
                        venue: $badmintonCenter,
                        name: "Tapal's Pickleball Doubles Cup",
                        teams: [
                            ['Dink Dynasty', $extraPlayers->slice(2, 2)->values()],
                            ['Kitchen Crashers', $extraPlayers->slice(4, 2)->values()],
                        ],
                        scoringType: 'best_of_sets',
                        setsToWin: 2,
                    );
                }
            }

            if ($tableTennis) {
                $this->createIndividualTournament(
                    organizer: $organizer,
                    venueOrganizer: $venueOrganizer,
                    sport: $tableTennis,
                    venue: $gymnasium,
                    name: 'Morong Table Tennis Singles Open',
                    players: [$extraPlayers[9], $extraPlayers[10]],
                    scoringType: 'best_of_sets',
                    setsToWin: 3,
                );

                $tableTennisDoubles = SportFormat::where('sport_id', $tableTennis->id)->where('name', 'Doubles')->first();

                if ($tableTennisDoubles) {
                    $this->createTeamTournament(
                        organizer: $organizer,
                        venueOrganizer: $venueOrganizer,
                        coach: $coach,
                        sport: $tableTennis,
                        format: $tableTennisDoubles,
                        venue: $gymnasium,
                        name: 'Morong Table Tennis Doubles Cup',
                        teams: [
                            ['Paddle Masters', $extraPlayers->slice(0, 2)->values()],
                            ['Spin Doctors', $extraPlayers->slice(2, 2)->values()],
                        ],
                        scoringType: 'best_of_sets',
                        setsToWin: 3,
                    );
                }
            }

            if ($tennis) {
                $this->createIndividualTournament(
                    organizer: $organizer,
                    venueOrganizer: $venueOrganizer,
                    sport: $tennis,
                    venue: $tennisCourts,
                    name: 'Morong Tennis Singles Open',
                    players: [$extraPlayers[7], $extraPlayers[8]],
                    scoringType: 'best_of_sets',
                    setsToWin: 2,
                );

                $tennisDoubles = SportFormat::where('sport_id', $tennis->id)->where('name', 'Doubles')->first();

                if ($tennisDoubles) {
                    $this->createTeamTournament(
                        organizer: $organizer,
                        venueOrganizer: $venueOrganizer,
                        coach: $coach,
                        sport: $tennis,
                        format: $tennisDoubles,
                        venue: $tennisCourts,
                        name: 'Morong Tennis Doubles Cup',
                        teams: [
                            ['Baseline Bandits', $extraPlayers->slice(8, 2)->values()],
                            ['Ace Attorneys', $extraPlayers->slice(10, 1)->push($player)->values()],
                        ],
                        scoringType: 'best_of_sets',
                        setsToWin: 2,
                    );
                }
            }
        }
    }

    /**
     * @param  array<int, User>  $players
     */
    private function createIndividualTournament(
        User $organizer,
        User $venueOrganizer,
        Sport $sport,
        Venue $venue,
        string $name,
        array $players,
        string $scoringType = 'single_score',
        ?int $setsToWin = null,
    ): void {
        $tournament = Tournament::create([
            'organizer_id' => $organizer->id,
            'name' => $name,
            'sport_id' => $sport->id,
            'format' => 'single_elimination',
            'starts_at' => now()->addDay(),
            'venue_id' => $venue->id,
            'venue_organizer_id' => $venueOrganizer->id,
            'status' => 'in_progress',
            'scoring_type' => $scoringType,
            'sets_to_win' => $setsToWin,
        ]);

        foreach ($players as $registrant) {
            TournamentRegistration::create([
                'tournament_id' => $tournament->id,
                'user_id' => $registrant->id,
                'status' => 'confirmed',
            ]);
        }

        app(BracketService::class)->generate($tournament);
    }

    /**
     * @param  array<int, array{0: string, 1: \Illuminate\Support\Collection<int, User>}>  $teams
     */
    private function createTeamTournament(
        User $organizer,
        User $venueOrganizer,
        User $coach,
        Sport $sport,
        SportFormat $format,
        Venue $venue,
        string $name,
        array $teams,
        string $scoringType = 'single_score',
        ?int $setsToWin = null,
    ): void {
        $tournament = Tournament::create([
            'organizer_id' => $organizer->id,
            'name' => $name,
            'sport_id' => $sport->id,
            'sport_format_id' => $format->id,
            'format' => 'single_elimination',
            'starts_at' => now()->addDay(),
            'venue_id' => $venue->id,
            'venue_organizer_id' => $venueOrganizer->id,
            'status' => 'in_progress',
            'scoring_type' => $scoringType,
            'sets_to_win' => $setsToWin,
        ]);

        foreach ($teams as [$teamName, $roster]) {
            $team = Team::create([
                'sport_id' => $sport->id,
                'sport_format_id' => $format->id,
                'captain_id' => $coach->id,
                'name' => $teamName,
                'status' => 'forming',
            ]);

            foreach ($roster as $member) {
                $team->members()->create([
                    'user_id' => $member->id,
                    'status' => 'accepted',
                    'responded_at' => now(),
                ]);
            }

            $team->refreshReadyStatus();

            TournamentRegistration::create([
                'tournament_id' => $tournament->id,
                'team_id' => $team->id,
                'registered_by' => $coach->id,
                'status' => 'confirmed',
            ]);
        }

        app(BracketService::class)->generate($tournament);
    }
}
