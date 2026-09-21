<?php

use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\PersonalAccessToken;

function baseRegistrationPayload(array $overrides = []): array
{
    return array_merge([
        'first_name' => 'New',
        'middle_name' => 'Q',
        'last_name' => 'User',
        'email' => 'newuser'.uniqid().'@example.com',
        'birthday' => '2000-05-15',
        'gender' => 'male',
        'address' => '123 Rizal St, Binangonan, Rizal',
        'phone' => '09171234567',
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
    expect($response->json('token'))->toBeString()->not->toBeEmpty();

    $user = User::where('email', $response->json('email'))->first();
    $this->assertDatabaseHas('users', ['id' => $user->id, 'first_name' => 'New', 'last_name' => 'User', 'gender' => 'male']);
    expect($user->proof_of_address_path)->not->toBeNull();
    Storage::disk('public')->assertExists($user->proof_of_address_path);
});

it('requires a valid gender on registration', function () {
    Storage::fake('public');

    $this->postJson('/api/register', baseRegistrationPayload(['gender' => null]))
        ->assertStatus(422)
        ->assertJsonValidationErrors('gender');

    $this->postJson('/api/register', baseRegistrationPayload(['gender' => 'other']))
        ->assertStatus(422)
        ->assertJsonValidationErrors('gender');

    $this->postJson('/api/register', baseRegistrationPayload(['gender' => 'female']))
        ->assertOk()
        ->assertJsonPath('gender', 'female');
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

    $response = $this->postJson('/api/login', ['email' => $user->email, 'password' => 'correct-password']);
    $response->assertOk();
    $response->assertJsonPath('email', $user->email);
    expect($response->json('token'))->toBeString()->not->toBeEmpty();
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

it('does not error logging out a session-authenticated (non-token) request', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->postJson('/api/logout')->assertNoContent();
});

it('revokes the bearer token used to log in, deleting it from the database', function () {
    $user = User::factory()->create(['password' => bcrypt('correct-password')]);

    $login = $this->postJson('/api/login', ['email' => $user->email, 'password' => 'correct-password']);
    $token = $login->json('token');

    $this->withHeader('Authorization', "Bearer {$token}")
        ->getJson('/api/user')
        ->assertOk();

    expect(PersonalAccessToken::count())->toBe(1);

    $this->withHeader('Authorization', "Bearer {$token}")
        ->postJson('/api/logout')
        ->assertNoContent();

    // The guard caches its resolved user for the lifetime of a single
    // test's shared application container, so a follow-up request in the
    // same test can't reliably re-prove the token is rejected (every real
    // HTTP request boots a fresh app instance, where this doesn't apply) —
    // asserting the token row itself is gone is what's actually reliable.
    expect(PersonalAccessToken::count())->toBe(0);
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

it('lets a venue facilitator upload their own payment QR code, replacing the old file, but denies every other role', function () {
    Storage::fake('public');
    $facilitator = userWithRole('venue_facilitator');

    $first = $this->actingAs($facilitator)->post('/api/user/qr-code', [
        'qr_code' => UploadedFile::fake()->image('gcash.png'),
    ]);
    $first->assertOk();
    $firstPath = $facilitator->fresh()->qr_code_path;
    Storage::disk('public')->assertExists($firstPath);
    expect($first->json('qr_code_url'))->toContain($firstPath);

    $second = $this->actingAs($facilitator)->post('/api/user/qr-code', [
        'qr_code' => UploadedFile::fake()->image('gcash-new.png'),
    ]);
    $second->assertOk();
    Storage::disk('public')->assertMissing($firstPath);
    Storage::disk('public')->assertExists($facilitator->fresh()->qr_code_path);

    foreach (['player', 'coach', 'admin', 'organizer'] as $role) {
        $this->actingAs(userWithRole($role))->post('/api/user/qr-code', [
            'qr_code' => UploadedFile::fake()->image('gcash.png'),
        ])->assertForbidden();
    }
});

it('lets a user edit their own name, phone, and address, recomposing the display name', function () {
    $user = userWithRole('player');
    $user->update(['first_name' => 'Juan', 'middle_name' => 'Santos', 'last_name' => 'Dela Cruz', 'name' => 'Juan Santos Dela Cruz']);

    $response = $this->actingAs($user)->patchJson('/api/user/profile', [
        'first_name' => 'Juanito',
        'phone' => '09171234567',
        'address' => '123 Rizal St, Binangonan, Rizal',
    ])->assertOk();

    $fresh = $user->fresh();
    expect($fresh->first_name)->toBe('Juanito');
    expect($fresh->last_name)->toBe('Dela Cruz');
    expect($fresh->phone)->toBe('09171234567');
    expect($fresh->address)->toBe('123 Rizal St, Binangonan, Rizal');
    // name recomposed from the new first_name plus the untouched middle/last.
    expect($fresh->name)->toBe('Juanito Santos Dela Cruz');
    expect($response->json('name'))->toBe('Juanito Santos Dela Cruz');
});

it('lets a user explicitly clear their middle name via profile edit', function () {
    $user = userWithRole('player');
    $user->update(['first_name' => 'Juan', 'middle_name' => 'Santos', 'last_name' => 'Dela Cruz', 'name' => 'Juan Santos Dela Cruz']);

    $this->actingAs($user)->patchJson('/api/user/profile', [
        'middle_name' => null,
    ])->assertOk();

    $fresh = $user->fresh();
    expect($fresh->middle_name)->toBeNull();
    expect($fresh->name)->toBe('Juan Dela Cruz');
});

it('never lets a profile edit touch email or password', function () {
    $user = userWithRole('player');
    $originalEmail = $user->email;
    $originalPassword = $user->password;

    $this->actingAs($user)->patchJson('/api/user/profile', [
        'phone' => '09171234567',
        'email' => 'hijacked@example.com',
        'password' => 'newpassword123',
    ])->assertOk();

    $fresh = $user->fresh();
    expect($fresh->email)->toBe($originalEmail);
    expect($fresh->password)->toBe($originalPassword);
    expect($fresh->phone)->toBe('09171234567');
});

it('denies editing a profile without authentication', function () {
    $this->patchJson('/api/user/profile', ['phone' => '09171234567'])->assertStatus(401);
});

it('lets a user export their own data as a JSON download', function () {
    $user = userWithRole('player');

    $response = $this->actingAs($user)->getJson('/api/user/data-export');

    $response->assertOk();
    $response->assertHeader('Content-Disposition', 'attachment; filename="sporthub-data-'.$user->id.'.json"');
    $response->assertJsonPath('profile.id', $user->id);
    expect($response->json('exported_at'))->toBeString();

    $this->assertDatabaseHas('audit_logs', [
        'actor_id' => $user->id,
        'action' => 'user.data_exported',
    ]);
});

it('denies exporting data without authentication', function () {
    $this->getJson('/api/user/data-export')->assertStatus(401);
});

it('lets a user delete their own account after confirming their password, and revokes every token', function () {
    $user = User::factory()->create(['password' => bcrypt('correct-password')]);
    $token = $user->createToken('other-device')->plainTextToken;
    expect(PersonalAccessToken::where('tokenable_id', $user->id)->count())->toBe(1);

    $this->actingAs($user)->deleteJson('/api/user', [
        'password' => 'correct-password',
    ])->assertNoContent();

    expect(User::find($user->id))->toBeNull();
    expect(User::withTrashed()->find($user->id))->not->toBeNull();
    expect(PersonalAccessToken::where('tokenable_id', $user->id)->count())->toBe(0);

    $this->assertDatabaseHas('audit_logs', [
        'actor_id' => $user->id,
        'action' => 'user.self_deleted',
    ]);
});

it('rejects self account deletion with the wrong password', function () {
    $user = User::factory()->create(['password' => bcrypt('correct-password')]);

    $this->actingAs($user)->deleteJson('/api/user', [
        'password' => 'wrong-password',
    ])->assertStatus(422);

    expect(User::find($user->id))->not->toBeNull();
});

it('denies self account deletion without authentication', function () {
    $this->deleteJson('/api/user', ['password' => 'whatever'])->assertStatus(401);
});
