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
            'admin' => ['Marites Villanueva', null],
            'organizer' => ['Ramon Cruz', null],
            'venue_organizer' => ['Grace Santos', null],
            'livestream_organizer' => ['Miguel Torres', null],
            'venue_facilitator' => ['Ligaya Mendoza', null],
            // Gender only matters for player/coach — it's what
            // tournament-eligibility ('required_gender') actually checks
            // (see TournamentRegistrationController) — every other role
            // leaves it null since nothing gates on their gender.
            'player' => ['Josef Reyes', 'male'],
            'coach' => ['Bea Fernandez', 'female'],
        ];

        foreach ($demoUsers as $role => [$name, $gender]) {
            $user = User::firstOrCreate(
                ['email' => "{$role}@sporthub.test"],
                ['name' => $name, 'gender' => $gender, 'password' => bcrypt('password')]
            );

            // firstOrCreate only applies the attributes on the *first* run —
            // re-running this seeder against a database that already has
            // these rows (e.g. re-seeding production) wouldn't otherwise
            // pick up a renamed demo user.
            if ($user->name !== $name) {
                $user->update(['name' => $name]);
            }
            if ($gender && $user->gender !== $gender) {
                $user->update(['gender' => $gender]);
            }

            if (! $user->hasRole($role)) {
                $user->assignRole($role);
            }
        }

        $this->call(SportsSeeder::class);
        $this->call(VenueSeeder::class);
        $this->call(SampleDataSeeder::class);
        $this->call(ExtendedTournamentsSeeder::class);
        $this->call(MalePlayerTopUpSeeder::class);
        $this->call(PlayerSkillEvaluationSeeder::class);
        $this->call(TeamAndPlayerImagerySeeder::class);
        $this->call(NewsfeedSeeder::class);
    }
}
