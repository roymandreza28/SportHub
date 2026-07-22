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
        'player' => [
            'create venue registration',
            'manage own profile',
            'create matchmaking request',
        ],
        'coach' => [
            'create tournament registration',
            'evaluate player',
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
