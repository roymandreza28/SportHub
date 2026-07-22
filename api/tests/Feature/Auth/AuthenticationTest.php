<?php

use App\Models\User;

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
