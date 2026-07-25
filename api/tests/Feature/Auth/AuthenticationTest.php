<?php

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

it('registers a new user, logs them in via session, and defaults them to player', function () {
    $response = $this->postJson('/api/register', [
        'name' => 'New User',
        'email' => 'newuser@example.com',
        'password' => 'password123',
        'password_confirmation' => 'password123',
    ]);

    $response->assertOk();
    $response->assertJsonPath('roles', ['player']);

    $this->assertDatabaseHas('users', ['email' => 'newuser@example.com']);
});

it('logs in an existing user and rejects bad credentials', function () {
    $user = User::factory()->create(['password' => bcrypt('correct-password')]);

    $this->postJson('/api/login', ['email' => $user->email, 'password' => 'wrong-password'])
        ->assertStatus(422);

    $this->postJson('/api/login', ['email' => $user->email, 'password' => 'correct-password'])
        ->assertOk()
        ->assertJsonPath('email', $user->email);
});

it('returns the authenticated user with roles on /api/user', function () {
    $user = userWithRole('coach');

    $this->actingAs($user)
        ->getJson('/api/user')
        ->assertOk()
        ->assertJsonPath('roles', ['coach']);
});

it('rejects unauthenticated access to /api/user with a clean 401, not a redirect-related 500', function () {
    $this->getJson('/api/user')->assertStatus(401);
});

it('logs out and invalidates the session', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->postJson('/api/logout')->assertNoContent();
});

it('rejects login for a deactivated account', function () {
    $user = User::factory()->create(['password' => bcrypt('correct-password'), 'is_active' => false]);

    $this->postJson('/api/login', ['email' => $user->email, 'password' => 'correct-password'])
        ->assertStatus(422);
});

it('rejects further requests and logs out a user whose account is deactivated mid-session', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->getJson('/api/user')->assertOk();

    $user->update(['is_active' => false]);

    $this->actingAs($user)->getJson('/api/user')->assertStatus(403);
});

it('lets a user change their own password after confirming the current one', function () {
    $user = User::factory()->create(['password' => bcrypt('correct-password')]);

    $this->actingAs($user)->patchJson('/api/user/password', [
        'current_password' => 'correct-password',
        'password' => 'brandnewpassword123',
    ])->assertNoContent();

    expect(Hash::check('brandnewpassword123', $user->fresh()->password))->toBeTrue();

    $this->assertDatabaseHas('audit_logs', [
        'actor_id' => $user->id,
        'action' => 'user.password_changed_self',
    ]);
});

it('rejects a self password change with the wrong current password', function () {
    $user = User::factory()->create(['password' => bcrypt('correct-password')]);

    $this->actingAs($user)->patchJson('/api/user/password', [
        'current_password' => 'wrong-password',
        'password' => 'brandnewpassword123',
    ])->assertStatus(422);

    expect(Hash::check('correct-password', $user->fresh()->password))->toBeTrue();
});

it('lets any authenticated role upload their own avatar, replacing the old file', function () {
    Storage::fake('public');
    $user = userWithRole('organizer');

    $first = $this->actingAs($user)->post('/api/user/avatar', [
        'avatar' => UploadedFile::fake()->create('me.jpg', 100, 'image/jpeg'),
    ]);
    $first->assertOk();
    $firstPath = $user->fresh()->avatar_path;
    Storage::disk('public')->assertExists($firstPath);
    expect($first->json('avatar_url'))->toContain($firstPath);

    $second = $this->actingAs($user)->post('/api/user/avatar', [
        'avatar' => UploadedFile::fake()->create('me-again.jpg', 100, 'image/jpeg'),
    ]);
    $second->assertOk();
    Storage::disk('public')->assertMissing($firstPath);
    Storage::disk('public')->assertExists($user->fresh()->avatar_path);
});

it('rejects a non-image avatar upload', function () {
    Storage::fake('public');
    $user = userWithRole('player');

    $this->actingAs($user)->post('/api/user/avatar', [
        'avatar' => UploadedFile::fake()->create('doc.pdf', 100),
    ])->assertStatus(422);
});
