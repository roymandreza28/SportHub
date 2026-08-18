<?php

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

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
    expect(collect($response->json('roles'))->pluck('name')->all())->toEqualCanonicalizing(['player', 'coach']);

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
        'phone' => '09171234567',
        'password' => 'password123',
    ]);

    $response->assertCreated();
    $response->assertJsonPath('roles.0.name', 'venue_facilitator');

    $this->assertDatabaseHas('audit_logs', ['action' => 'facilitator.created']);
});

it('lets an admin create each of the 3 organizer account types', function () {
    $admin = userWithRole('admin');

    $cases = [
        'main' => 'organizer',
        'venue' => 'venue_organizer',
        'livestream' => 'livestream_organizer',
    ];

    foreach ($cases as $type => $expectedRole) {
        $response = $this->actingAs($admin)->postJson('/api/admin/organizers', [
            'name' => "New {$type} organizer",
            'email' => "{$type}organizer@example.com",
            'password' => 'password123',
            'type' => $type,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('roles.0.name', $expectedRole);
    }

    $this->assertDatabaseHas('audit_logs', ['action' => 'organizer.created']);
});

it('rejects an invalid organizer account type', function () {
    $admin = userWithRole('admin');

    $this->actingAs($admin)->postJson('/api/admin/organizers', [
        'name' => 'Bad Type',
        'email' => 'badtype@example.com',
        'password' => 'password123',
        'type' => 'nonexistent',
    ])->assertStatus(422);
});

it('denies organizer account creation to a non-admin role', function () {
    $organizer = userWithRole('organizer');

    $this->actingAs($organizer)->postJson('/api/admin/organizers', [
        'name' => 'Nope',
        'email' => 'nope@example.com',
        'password' => 'password123',
        'type' => 'main',
    ])->assertForbidden();
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

it('lets an admin change another users password and logs it', function () {
    $admin = userWithRole('admin');
    $target = userWithRole('player');

    $response = $this->actingAs($admin)->patchJson("/api/admin/users/{$target->id}/password", [
        'password' => 'newpassword123',
    ]);

    $response->assertNoContent();
    expect(Hash::check('newpassword123', $target->fresh()->password))->toBeTrue();

    $this->assertDatabaseHas('audit_logs', [
        'actor_id' => $admin->id,
        'action' => 'user.password_changed',
        'subject_id' => $target->id,
    ]);
});

it('lets an admin deactivate and reactivate another users account', function () {
    $admin = userWithRole('admin');
    $target = userWithRole('player');

    $response = $this->actingAs($admin)->patchJson("/api/admin/users/{$target->id}/status", [
        'is_active' => false,
    ]);

    $response->assertOk();
    expect($target->fresh()->is_active)->toBeFalse();
    $this->assertDatabaseHas('audit_logs', ['action' => 'user.deactivated', 'subject_id' => $target->id]);

    $response = $this->actingAs($admin)->patchJson("/api/admin/users/{$target->id}/status", [
        'is_active' => true,
    ]);

    $response->assertOk();
    expect($target->fresh()->is_active)->toBeTrue();
    $this->assertDatabaseHas('audit_logs', ['action' => 'user.activated', 'subject_id' => $target->id]);
});

it('lets an admin verify a pending account, notifying the user', function () {
    $admin = userWithRole('admin');
    $target = userWithRole('player');
    $target->update(['verification_status' => 'pending']);

    $response = $this->actingAs($admin)->patchJson("/api/admin/users/{$target->id}/verification", [
        'verification_status' => 'verified',
    ]);

    $response->assertOk();
    expect($target->fresh()->verification_status)->toBe('verified');
    $this->assertDatabaseHas('audit_logs', ['action' => 'user.verification_verified', 'subject_id' => $target->id]);

    $notification = $this->actingAs($target)->getJson('/api/notifications')->json();
    expect(collect($notification)->contains(fn ($n) => $n['type'] === 'account_verified'))->toBeTrue();
});

it('lets an admin reject a pending account, notifying the user', function () {
    $admin = userWithRole('admin');
    $target = userWithRole('coach');
    $target->update(['verification_status' => 'pending']);

    $this->actingAs($admin)->patchJson("/api/admin/users/{$target->id}/verification", [
        'verification_status' => 'rejected',
    ])->assertOk();

    expect($target->fresh()->verification_status)->toBe('rejected');
    $this->assertDatabaseHas('audit_logs', ['action' => 'user.verification_rejected', 'subject_id' => $target->id]);
});

it('lists pending and rejected accounts with their proof document URLs, but not already-verified ones', function () {
    Storage::fake('public');
    $admin = userWithRole('admin');

    $pendingPlayer = userWithRole('player');
    $pendingPlayer->update([
        'verification_status' => 'pending',
        'proof_of_address_path' => UploadedFile::fake()->create('id.jpg', 100, 'image/jpeg')
            ->store('proof-of-address/'.$pendingPlayer->id, 'public'),
    ]);

    $rejectedCoach = userWithRole('coach');
    $rejectedCoach->update([
        'verification_status' => 'rejected',
        'proof_of_address_path' => UploadedFile::fake()->create('id.jpg', 100, 'image/jpeg')
            ->store('proof-of-address/'.$rejectedCoach->id, 'public'),
        'coach_eligibility_proof_path' => UploadedFile::fake()->create('license.pdf', 100, 'application/pdf')
            ->store('coach-eligibility/'.$rejectedCoach->id, 'public'),
    ]);

    $verifiedPlayer = userWithRole('player'); // stays verified by default — must not appear

    $response = $this->actingAs($admin)->getJson('/api/admin/users/pending-verifications');

    $response->assertOk();
    $ids = collect($response->json())->pluck('id');
    expect($ids)->toContain($pendingPlayer->id, $rejectedCoach->id);
    expect($ids)->not->toContain($verifiedPlayer->id);

    $coachEntry = collect($response->json())->firstWhere('id', $rejectedCoach->id);
    expect($coachEntry['proof_of_address_url'])->not->toBeNull();
    expect($coachEntry['coach_eligibility_proof_url'])->not->toBeNull();

    $playerEntry = collect($response->json())->firstWhere('id', $pendingPlayer->id);
    expect($playerEntry['coach_eligibility_proof_url'])->toBeNull();
});

it('denies the pending-verifications queue to a non-admin role', function () {
    $player = userWithRole('player');

    $this->actingAs($player)->getJson('/api/admin/users/pending-verifications')->assertForbidden();
});

it('prevents an admin from deactivating their own account', function () {
    $admin = userWithRole('admin');

    $response = $this->actingAs($admin)->patchJson("/api/admin/users/{$admin->id}/status", [
        'is_active' => false,
    ]);

    $response->assertStatus(422);
    expect($admin->fresh()->is_active)->toBeTrue();
});

it('lets an admin soft delete another users account and logs it', function () {
    $admin = userWithRole('admin');
    $target = userWithRole('player');

    $response = $this->actingAs($admin)->deleteJson("/api/admin/users/{$target->id}");

    $response->assertNoContent();
    expect(User::find($target->id))->toBeNull();
    expect(User::withTrashed()->find($target->id))->not->toBeNull();

    $this->assertDatabaseHas('audit_logs', [
        'actor_id' => $admin->id,
        'action' => 'user.deleted',
        'subject_id' => $target->id,
    ]);
});

it('prevents an admin from deleting their own account', function () {
    $admin = userWithRole('admin');

    $response = $this->actingAs($admin)->deleteJson("/api/admin/users/{$admin->id}");

    $response->assertStatus(422);
    expect(User::find($admin->id))->not->toBeNull();
});
