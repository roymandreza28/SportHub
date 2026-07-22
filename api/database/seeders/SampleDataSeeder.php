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
        $badminton = Sport::where('name', 'Badminton')->first();

        $civicCenter = Venue::firstOrCreate(
            ['facilitator_id' => $facilitator->id, 'name' => 'Civic Center Sports Complex'],
            [
                'address' => '100 Civic Center Dr, Springfield',
                'latitude' => 39.7817,
                'longitude' => -89.6501,
                'description' => 'Multi-purpose municipal sports complex.',
                'amenities' => ['parking', 'lockers', 'restrooms'],
            ]
        );

        $civicCenter->courts()->firstOrCreate(
            ['name' => 'Court A'],
            ['sport_id' => $basketball?->id, 'type' => 'court', 'capacity' => 30, 'status' => 'active']
        );
        $civicCenter->courts()->firstOrCreate(
            ['name' => 'Court B'],
            ['sport_id' => $badminton?->id, 'type' => 'court', 'capacity' => 20, 'status' => 'active']
        );
        $civicCenter->equipment()->firstOrCreate(
            ['name' => 'Basketballs'],
            ['quantity_total' => 20, 'quantity_available' => 20]
        );

        $riverside = Venue::firstOrCreate(
            ['facilitator_id' => $facilitator->id, 'name' => 'Riverside Community Park'],
            [
                'address' => '250 Riverside Ave, Springfield',
                'latitude' => 39.7901,
                'longitude' => -89.6440,
                'description' => 'Outdoor community fields and courts.',
                'amenities' => ['parking', 'water fountain'],
            ]
        );

        $riverside->courts()->firstOrCreate(
            ['name' => 'Field 1'],
            ['sport_id' => Sport::where('name', 'Football')->first()?->id, 'type' => 'field', 'capacity' => 50, 'status' => 'active']
        );

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
                    'level' => 'intermediate',
                    'score' => 62.5,
                    'evaluated_at' => now(),
                ]
            );
        }
    }
}
