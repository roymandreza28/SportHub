<?php

use App\Models\Sport;
use App\Models\SportFormat;
use App\Models\Team;
use App\Models\User;
use Database\Seeders\RolesAndPermissionsSeeder;

/*
|--------------------------------------------------------------------------
| Test Case
|--------------------------------------------------------------------------
|
| The closure you provide to your test functions is always bound to a specific PHPUnit test
| case class. By default, that class is "PHPUnit\Framework\TestCase". Of course, you may
| need to change it using the "pest()" function to bind a different classes or traits.
|
*/

pest()->extend(Tests\TestCase::class)
    ->use(Illuminate\Foundation\Testing\RefreshDatabase::class)
    ->beforeEach(fn () => $this->seed(RolesAndPermissionsSeeder::class))
    ->in('Feature');

/*
|--------------------------------------------------------------------------
| Functions
|--------------------------------------------------------------------------
|
| Project-wide test helpers. Every Feature test already has the 5 roles and
| their permissions seeded (see beforeEach above), so this just creates a
| user and assigns them one.
|
*/

function userWithRole(string $role): User
{
    $user = User::factory()->create();
    $user->assignRole($role);

    return $user;
}

/**
 * Builds a full, 'ready' team for the given captain/sport/format, filling
 * every remaining slot with freshly-created players — for tests that need a
 * ready team to exist without exercising the invite/accept flow itself.
 */
function createReadyTeam(User $captain, Sport $sport, SportFormat $format): Team
{
    $team = Team::create([
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'captain_id' => $captain->id,
        'name' => "{$captain->name}'s Team",
        'status' => 'forming',
    ]);

    $team->members()->create(['user_id' => $captain->id, 'status' => 'accepted', 'responded_at' => now()]);

    for ($i = 1; $i < $format->players_per_side; $i++) {
        $teammate = User::factory()->create();
        $teammate->assignRole('player');
        $team->members()->create(['user_id' => $teammate->id, 'status' => 'accepted', 'responded_at' => now()]);
    }

    $team->refreshReadyStatus();

    return $team;
}
