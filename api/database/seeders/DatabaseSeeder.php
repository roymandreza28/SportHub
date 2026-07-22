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
            'admin' => 'Ada Admin',
            'organizer' => 'Olu Organizer',
            'venue_facilitator' => 'Fay Facilitator',
            'player' => 'Pat Player',
            'coach' => 'Cody Coach',
        ];

        foreach ($demoUsers as $role => $name) {
            User::factory()->create([
                'name' => $name,
                'email' => "{$role}@sporthub.test",
                'password' => bcrypt('password'),
            ])->assignRole($role);
        }
    }
}
