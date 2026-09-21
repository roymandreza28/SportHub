<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

// Extra seeded male player accounts (player61..player75) — added when
// "make every seeded tournament men-only" turned out to need more distinct
// male players than existed at the time (27): the 8-team, 5-a-side
// Interbarangay Basketball Championship alone needs 40 unique roster
// slots. Kept as its own seeder rather than folded into
// ExtendedTournamentsSeeder's combinatorial player21..player60 block —
// this is a one-off top-up, not part of that repeating first-name ×
// last-name pattern.
class MalePlayerTopUpSeeder extends Seeder
{
    private const NAMES = [
        'Emmanuel Reyes', 'Benjamin Cruz', 'Vincent Aguilar', 'Patrick Flores', 'Adrian Santiago',
        'Leonardo Bautista', 'Francisco Mercado', 'Gabriel Ramirez', 'Anton Dizon', 'Marcus Villegas',
        'Julius Padilla', 'Renato Pascual', 'Oliver Ignacio', 'Simon Rivera', 'Teodoro Mendoza',
    ];

    public function run(): void
    {
        collect(self::NAMES)->each(function (string $name, int $i) {
            $email = 'player'.($i + 61).'@sporthub.test';
            $user = User::firstOrCreate(['email' => $email], ['name' => $name, 'gender' => 'male', 'password' => bcrypt('password')]);

            if ($user->name !== $name) {
                $user->update(['name' => $name]);
            }
            if ($user->gender !== 'male') {
                $user->update(['gender' => 'male']);
            }
            if (! $user->hasRole('player')) {
                $user->assignRole('player');
            }
        });
    }
}
