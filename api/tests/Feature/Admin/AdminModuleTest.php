<?php

use App\Models\AuditLog;
use App\Models\User;

it('denies every admin route to a non-admin role', function () {
    $player = userWithRole('player');

    $this->actingAs($player)->getJson('/api/admin/users')->assertForbidden();
    $this->actingAs($player)->getJson('/api/admin/dashboard/metrics')->assertForbidden();
    $this->actingAs($player)->getJson('/api/admin/audit-log')->assertForbidden();
});

it('lets an admin search users by name or email', function () {
    $admin = userWithRole('admin');
    User::factory()->create(['name' => 'Findable Person', 'email' => 'findable@example.com']);
    User::factory()->create(['name' => 'Someone Else', 'email' => 'else@example.com']);

    $response = $this->actingAs($admin)->getJson('/api/admin/users?search=Findable');

    $response->assertOk();
    expect($response->json('data'))->toHaveCount(1);
    expect($response->json('data.0.name'))->toBe('Findable Person');
});

it('lets an admin sync a users roles and records an audit log entry', function () {
    $admin = userWithRole('admin');
    $target = userWithRole('player');

    $response = $this->actingAs($admin)->patchJson("/api/admin/users/{$target->id}/roles", [
        'roles' => ['player', 'coach'],
    ]);

    $response->assertOk();
    expect($response->json('roles'))->toEqualCanonicalizing(['player', 'coach']);

    $this->assertDatabaseHas('audit_logs', [
        'actor_id' => $admin->id,
        'action' => 'user.roles_updated',
        'subject_id' => $target->id,
    ]);
});

it('lets an admin create a facilitator account, defaults it to the venue_facilitator role, and logs it', function () {
    $admin = userWithRole('admin');

    $response = $this->actingAs($admin)->postJson('/api/admin/facilitators', [
        'name' => 'New Facilitator',
        'email' => 'newfac@example.com',
        'password' => 'password123',
    ]);

    $response->assertCreated();
    $response->assertJsonPath('roles', ['venue_facilitator']);

    $this->assertDatabaseHas('audit_logs', ['action' => 'facilitator.created']);
});

it('reports metrics that reflect real counts', function () {
    $admin = userWithRole('admin');
    userWithRole('player');
    userWithRole('player');

    $response = $this->actingAs($admin)->getJson('/api/admin/dashboard/metrics');

    $response->assertOk();
    expect($response->json('users_by_role.player'))->toBe(2);
});

it('lists audit log entries newest first', function () {
    $admin = userWithRole('admin');
    AuditLog::record($admin, 'first.action');
    AuditLog::record($admin, 'second.action');

    $response = $this->actingAs($admin)->getJson('/api/admin/audit-log');

    $response->assertOk();
    expect($response->json('data.0.action'))->toBe('second.action');
});
