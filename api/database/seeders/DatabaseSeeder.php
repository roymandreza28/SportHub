<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        $this->call(RolesAndPermissionsSeeder::class);

        $demoUsers = [
            'admin' => 'Marites Villanueva',
            'organizer' => 'Ramon Cruz',
            'venue_organizer' => 'Grace Santos',
            'livestream_organizer' => 'Miguel Torres',
            'venue_facilitator' => 'Ligaya Mendoza',
            'player' => 'Josef Reyes',
            'coach' => 'Bea Fernandez',
        ];

        foreach ($demoUsers as $role => $name) {
            $user = User::firstOrCreate(
                ['email' => "{$role}@sporthub.test"],
                ['name' => $name, 'password' => bcrypt('password')]
            );

            // firstOrCreate only applies the attributes on the *first* run —
            // re-running this seeder against a database that already has
            // these rows (e.g. re-seeding production) wouldn't otherwise
            // pick up a renamed demo user.
            if ($user->name !== $name) {
                $user->update(['name' => $name]);
            }

            if (! $user->hasRole($role)) {
                $user->assignRole($role);
            }
        }

        $this->call(SportsSeeder::class);
        $this->call(SampleDataSeeder::class);
    }
}
