<?php

namespace Database\Seeders;

use App\Models\Sport;
use Illuminate\Database\Seeder;

class SportsSeeder extends Seeder
{
    // Basketball/Volleyball/Badminton reflect confirmed real facilities in
    // Morong, Rizal (Morong Gymnasium, barangay covered courts, Tapal's
    // Badminton Center). Pickleball, Tennis, and Table Tennis were added on
    // direct request on top of that baseline — courts for these are
    // commonly set up as conversions of existing badminton/tennis courts
    // rather than dedicated venues, so no separate facility-research pass
    // was run for them the way it was for the original three.
    private const FORMATS = [
        'Basketball' => [['name' => '5v5', 'players_per_side' => 5], ['name' => '3v3', 'players_per_side' => 3]],
        'Volleyball' => [['name' => '6v6', 'players_per_side' => 6]],
        'Badminton' => [['name' => 'Singles', 'players_per_side' => 1], ['name' => 'Doubles', 'players_per_side' => 2]],
        'Pickleball' => [['name' => 'Singles', 'players_per_side' => 1], ['name' => 'Doubles', 'players_per_side' => 2]],
        'Tennis' => [['name' => 'Singles', 'players_per_side' => 1], ['name' => 'Doubles', 'players_per_side' => 2]],
        'Table Tennis' => [['name' => 'Singles', 'players_per_side' => 1], ['name' => 'Doubles', 'players_per_side' => 2]],
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
        ];

        foreach ($sports as $sportData) {
            $sport = Sport::firstOrCreate(['name' => $sportData['name']], $sportData);

            foreach (self::FORMATS[$sportData['name']] ?? [] as $format) {
                $sport->formats()->firstOrCreate(['name' => $format['name']], $format);
            }
        }
    }
}
