<?php

namespace Database\Seeders;

use Illuminate\Database\QueryException;
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
            'manage news',
        ],
        // Scores/fouls/timeouts for any organizer's ongoing tournament —
        // deliberately excludes 'manage tournaments'/'generate bracket' so
        // this role can't create or restructure tournaments.
        'venue_organizer' => [
            'update match score',
            'manage news',
        ],
        // Feeds camera footage into a livestream tied to any organizer's
        // tournament — deliberately excludes every other organizer ability.
        'livestream_organizer' => [
            'manage livestreams',
            'manage news',
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
        $this->findOrCreateRole('admin');

        foreach ($this->permissionsByRole as $permissions) {
            foreach ($permissions as $permissionName) {
                $this->findOrCreatePermission($permissionName);
            }
        }

        app(PermissionRegistrar::class)->forgetCachedPermissions();

        foreach ($this->permissionsByRole as $roleName => $permissions) {
            $this->findOrCreateRole($roleName)->syncPermissions($permissions);
        }
    }

    // Spatie's own findOrCreate() checks its permission/role cache before
    // deciding whether to insert. That cache can be stale relative to the
    // database under any kind of partial-prior-run residue — e.g. a deploy
    // that seeded some rows before its container was killed and restarted
    // mid-seed — in which case findOrCreate tries to insert a row that
    // already exists and throws a unique-constraint violation instead of
    // finding it. Falls back to a direct lookup on exactly that failure,
    // rather than letting one already-seeded row abort every seeder after
    // this one in DatabaseSeeder's run.
    private function findOrCreatePermission(string $name): Permission
    {
        try {
            return Permission::findOrCreate($name);
        } catch (QueryException) {
            return Permission::where('name', $name)->firstOrFail();
        }
    }

    private function findOrCreateRole(string $name): Role
    {
        try {
            return Role::findOrCreate($name);
        } catch (QueryException) {
            return Role::where('name', $name)->firstOrFail();
        }
    }
}
