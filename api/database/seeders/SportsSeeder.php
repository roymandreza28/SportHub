<?php

namespace Database\Seeders;

use App\Models\Sport;
use Illuminate\Database\Seeder;

class SportsSeeder extends Seeder
{
    // Basketball/Volleyball/Badminton/Tennis/Table Tennis reflect confirmed
    // real facilities in Binangonan, Rizal — the Binangonan Recreation and
    // Conference Center (BRCC) alone hosts basketball, volleyball, badminton,
    // lawn tennis, and table tennis, and the town plaza has combined
    // basketball-and-tennis courts. Pickleball was added on top of that
    // baseline — courts for it are commonly set up as conversions of
    // existing badminton/tennis courts rather than a dedicated venue, so no
    // separate facility-research pass was run for it the way it was for the
    // other five.
    private const FORMATS = [
        'Basketball' => [['name' => '5v5', 'players_per_side' => 5], ['name' => '3v3', 'players_per_side' => 3]],
        'Volleyball' => [['name' => '6v6', 'players_per_side' => 6]],
        'Badminton' => [['name' => 'Singles', 'players_per_side' => 1], ['name' => 'Doubles', 'players_per_side' => 2]],
        'Pickleball' => [['name' => 'Singles', 'players_per_side' => 1], ['name' => 'Doubles', 'players_per_side' => 2]],
        'Tennis' => [['name' => 'Singles', 'players_per_side' => 1], ['name' => 'Doubles', 'players_per_side' => 2]],
        'Table Tennis' => [['name' => 'Singles', 'players_per_side' => 1], ['name' => 'Doubles', 'players_per_side' => 2]],
        // Mirrors Badminton/Tennis's singles-vs-team split: "Scratch Singles"
        // (players_per_side 1) is never a valid sport_format_id — see
        // TournamentController::validateSportFormat() — so it's the implicit
        // individual mode; "Handicap Doubles" and "Team Baker" are real team
        // formats an organizer can pick. BRCC's own Bowling Center (12
        // duckpin + 8 ten-pin lanes, per VenueSeeder) is the real facility
        // this is modeled on.
        'Bowling' => [
            ['name' => 'Scratch Singles', 'players_per_side' => 1],
            ['name' => 'Handicap Doubles', 'players_per_side' => 2],
            ['name' => 'Team Baker', 'players_per_side' => 4],
        ],
    ];

    public function run(): void
    {
        $sports = [
            ['name' => 'Basketball', 'category' => 'team'],
            ['name' => 'Volleyball', 'category' => 'team'],
            ['name' => 'Badminton', 'category' => 'racket'],
            ['name' => 'Pickleball', 'category' => 'racket'],
            ['name' => 'Tennis', 'category' => 'racket'],
            ['name' => 'Table Tennis', 'category' => 'racket'],
            // Not 'team' — like Badminton/Tennis, it supports both an
            // individual (Scratch Singles) and team (Handicap Doubles/Team
            // Baker) mode, so sport_format_id must stay optional.
            ['name' => 'Bowling', 'category' => 'other'],
        ];

        foreach ($sports as $sportData) {
            $sport = Sport::firstOrCreate(['name' => $sportData['name']], $sportData);

            foreach (self::FORMATS[$sportData['name']] ?? [] as $format) {
                $sport->formats()->firstOrCreate(['name' => $format['name']], $format);
            }
        }
    }
}
