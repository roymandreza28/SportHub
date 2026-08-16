<?php

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;

function baseRegistrationPayload(array $overrides = []): array
{
    return array_merge([
        'first_name' => 'New',
        'middle_name' => 'Q',
        'last_name' => 'User',
        'email' => 'newuser'.uniqid().'@example.com',
        'birthday' => '2000-05-15',
        'address' => '123 Rizal St, Morong, Rizal',
        'proof_of_address' => UploadedFile::fake()->create('id.jpg', 100, 'image/jpeg'),
        'role' => 'player',
        'password' => 'Password123',
        'password_confirmation' => 'Password123',
    ], $overrides);
}

it('registers a new player, combines the name parts, logs them in, and stores their proof of address', function () {
    Storage::fake('public');

    $response = $this->postJson('/api/register', baseRegistrationPayload());

    $response->assertOk();
    $response->assertJsonPath('roles', ['player']);
    $response->assertJsonPath('name', 'New Q User');

    $user = User::where('email', $response->json('email'))->first();
    $this->assertDatabaseHas('users', ['id' => $user->id, 'first_name' => 'New', 'last_name' => 'User']);
    expect($user->proof_of_address_path)->not->toBeNull();
    Storage::disk('public')->assertExists($user->proof_of_address_path);
});

it('starts a freshly-registered account pending verification and notifies them of it', function () {
    Storage::fake('public');

    $response = $this->postJson('/api/register', baseRegistrationPayload());
    $response->assertOk();

    $user = User::where('email', $response->json('email'))->first();
    expect($user->verification_status)->toBe('pending');

    $notifications = $this->actingAs($user)->getJson('/api/notifications')->json();
    expect(collect($notifications)->contains(fn ($n) => $n['type'] === 'account_pending_verification'))->toBeTrue();
});

it('registers a coach with eligibility proof and grants both the coach and player roles', function () {
    Storage::fake('public');

    $response = $this->postJson('/api/register', baseRegistrationPayload([
        'role' => 'coach',
        'coach_eligibility_proof' => UploadedFile::fake()->create('license.pdf', 200, 'application/pdf'),
    ]));

    $response->assertOk();
    expect($response->json('roles'))->toEqualCanonicalizing(['coach', 'player']);

    $user = User::where('email', $response->json('email'))->first();
    expect($user->coach_eligibility_proof_path)->not->toBeNull();
    Storage::disk('public')->assertExists($user->coach_eligibility_proof_path);
});

it('rejects a coach registration with no eligibility proof', function () {
    $payload = baseRegistrationPayload(['role' => 'coach']);
    unset($payload['coach_eligibility_proof']);

    $this->postJson('/api/register', $payload)
        ->assertStatus(422)
        ->assertJsonValidationErrors('coach_eligibility_proof');
});

it('rejects a password missing an uppercase letter or a number', function () {
    $this->postJson('/api/register', baseRegistrationPayload([
        'password' => 'lowercaseonly',
        'password_confirmation' => 'lowercaseonly',
    ]))->assertStatus(422)->assertJsonValidationErrors('password');

    $this->postJson('/api/register', baseRegistrationPayload([
        'password' => 'NoNumbersHere',
        'password_confirmation' => 'NoNumbersHere',
    ]))->assertStatus(422)->assertJsonValidationErrors('password');
});

it('rejects a password that is just the birthday in a common date format', function () {
    $this->postJson('/api/register', baseRegistrationPayload([
        'birthday' => '2000-05-15',
        'password' => '2000-05-15',
        'password_confirmation' => '2000-05-15',
    ]))->assertStatus(422)->assertJsonValidationErrors('password');

    $this->postJson('/api/register', baseRegistrationPayload([
        'birthday' => '2000-05-15',
        'password' => '05152000',
        'password_confirmation' => '05152000',
    ]))->assertStatus(422)->assertJsonValidationErrors('password');
});

it('rejects registration missing proof of address', function () {
    $payload = baseRegistrationPayload();
    unset($payload['proof_of_address']);

    $this->postJson('/api/register', $payload)
        ->assertStatus(422)
        ->assertJsonValidationErrors('proof_of_address');
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
