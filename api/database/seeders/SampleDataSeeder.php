<?php

namespace Database\Seeders;

use App\Models\PlayerProfile;
use App\Models\Sport;
use App\Models\User;
use App\Models\Venue;
use Illuminate\Database\Seeder;

class SampleDataSeeder extends Seeder
{
    public function run(): void
    {
        $facilitator = User::where('email', 'venue_facilitator@sporthub.test')->first();
        $player = User::where('email', 'player@sporthub.test')->first();
        $coach = User::where('email', 'coach@sporthub.test')->first();

        if (! $facilitator || ! $player || ! $coach) {
            return;
        }

        $basketball = Sport::where('name', 'Basketball')->first();
        $volleyball = Sport::where('name', 'Volleyball')->first();
        $badminton = Sport::where('name', 'Badminton')->first();

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
    }
}
