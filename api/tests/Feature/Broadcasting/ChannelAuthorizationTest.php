<?php

use App\Models\Venue;

// The suite's default BROADCAST_CONNECTION=null (see phpunit.xml) uses
// Laravel's NullBroadcaster, whose auth() is a total no-op, so every channel
// request would return 200 regardless of channel or user — useless for
// testing authorization. Switching the config here isn't enough on its own:
// routes/channels.php already ran once at boot time against the *original*
// default driver instance, so a later config() change makes Broadcast::auth()
// resolve a fresh 'reverb' driver that never received those registrations.
// Re-requiring channels.php after the switch attaches them to the instance
// that will actually be used. No live Reverb connection is needed either way
// — /broadcasting/auth is a pure HMAC computation, no outbound socket.
beforeEach(function () {
    config(['broadcasting.default' => 'reverb']);
    require base_path('routes/channels.php');
});

it('authorizes a user for their own private matchmaking channel and denies another users', function () {
    $user = userWithRole('player');

    $this->actingAs($user)
        ->postJson('/broadcasting/auth', ['socket_id' => '1.1', 'channel_name' => "private-matchmaking.{$user->id}"])
        ->assertOk();

    $this->actingAs($user)
        ->postJson('/broadcasting/auth', ['socket_id' => '1.1', 'channel_name' => 'private-matchmaking.999999'])
        ->assertForbidden();
});

it('authorizes only the owning facilitator (or admin) for a venues schedule channel', function () {
    $owner = userWithRole('venue_facilitator');
    $other = userWithRole('venue_facilitator');
    $admin = userWithRole('admin');
    $venue = Venue::create([
        'facilitator_id' => $owner->id, 'name' => 'V', 'address' => 'A', 'latitude' => 1, 'longitude' => 1,
    ]);

    $this->actingAs($owner)
        ->postJson('/broadcasting/auth', ['socket_id' => '1.1', 'channel_name' => "private-venue.{$venue->id}.schedule"])
        ->assertOk();

    $this->actingAs($other)
        ->postJson('/broadcasting/auth', ['socket_id' => '1.1', 'channel_name' => "private-venue.{$venue->id}.schedule"])
        ->assertForbidden();

    $this->actingAs($admin)
        ->postJson('/broadcasting/auth', ['socket_id' => '1.1', 'channel_name' => "private-venue.{$venue->id}.schedule"])
        ->assertOk();
});

it('authorizes any authenticated user to join a livestream presence chat channel', function () {
    $user = userWithRole('player');

    $response = $this->actingAs($user)
        ->postJson('/broadcasting/auth', ['socket_id' => '1.1', 'channel_name' => 'presence-livestream.1.chat']);

    $response->assertOk();
    expect($response->json('channel_data'))->toBeString();
});

it('denies a totally unregistered channel', function () {
    $player = userWithRole('player');

    $this->actingAs($player)
        ->postJson('/broadcasting/auth', ['socket_id' => '1.1', 'channel_name' => 'private-totally-bogus-channel-xyz'])
        ->assertForbidden();
});

it('denies admin.monitoring to a non-admin and allows it for an admin', function () {
    $player = userWithRole('player');
    $admin = userWithRole('admin');

    $this->actingAs($player)
        ->postJson('/broadcasting/auth', ['socket_id' => '1.1', 'channel_name' => 'private-admin.monitoring'])
        ->assertForbidden();

    $this->actingAs($admin)
        ->postJson('/broadcasting/auth', ['socket_id' => '1.1', 'channel_name' => 'private-admin.monitoring'])
        ->assertOk();
});
