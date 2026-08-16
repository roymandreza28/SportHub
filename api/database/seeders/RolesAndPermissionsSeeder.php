<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class RolesAndPermissionsSeeder extends Seeder
{
    protected array $permissionsByRole = [
        'organizer' => [
            'manage tournaments',
            'generate bracket',
            'update match score',
            'manage news',
            'manage livestreams',
        ],
        'venue_facilitator' => [
            'manage venues',
            'manage courts',
            'manage equipment',
            'manage venue registrations',
        ],
        // Scores/fouls/timeouts for any organizer's ongoing tournament —
        // deliberately excludes 'manage tournaments'/'generate bracket'/
        // 'manage news' so this role can't create or restructure tournaments.
        'venue_organizer' => [
            'update match score',
        ],
        // Feeds camera footage into a livestream tied to any organizer's
        // tournament — deliberately excludes every other organizer ability.
        'livestream_organizer' => [
            'manage livestreams',
        ],
        'player' => [
            'create venue registration',
            'manage own profile',
            'create matchmaking request',
            'manage teams',
            'manage friendships',
            'create posts',
            'use chat',
            'interact with news',
        ],
        'coach' => [
            'create tournament registration',
            'evaluate player',
            'create venue registration',
            'create matchmaking request',
            'manage teams',
            'manage friendships',
            'create posts',
            'use chat',
            'interact with news',
        ],
    ];

    public function run(): void
    {
        // 'admin' is intentionally not assigned any permissions here —
        // AppServiceProvider grants it every ability via Gate::before().
        Role::findOrCreate('admin');

        foreach ($this->permissionsByRole as $permissions) {
            foreach ($permissions as $permissionName) {
                Permission::findOrCreate($permissionName);
            }
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        foreach ($this->permissionsByRole as $roleName => $permissions) {
            Role::findOrCreate($roleName)->syncPermissions($permissions);
        }
    }
}
