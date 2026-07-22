<?php

namespace Database\Seeders;

use App\Models\Sport;
use Illuminate\Database\Seeder;

class SportsSeeder extends Seeder
{
    public function run(): void
    {
        $sports = [
            ['name' => 'Basketball', 'category' => 'team'],
            ['name' => 'Volleyball', 'category' => 'team'],
            ['name' => 'Football', 'category' => 'team'],
            ['name' => 'Badminton', 'category' => 'racket'],
            ['name' => 'Table Tennis', 'category' => 'racket'],
            ['name' => 'Tennis', 'category' => 'racket'],
            ['name' => 'Swimming', 'category' => 'individual'],
            ['name' => 'Athletics', 'category' => 'individual'],
            ['name' => 'Chess', 'category' => 'individual'],
        ];

        foreach ($sports as $sport) {
            Sport::firstOrCreate(['name' => $sport['name']], $sport);
        }
    }
}
