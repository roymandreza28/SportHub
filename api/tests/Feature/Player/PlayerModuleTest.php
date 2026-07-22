<?php

use App\Models\Sport;

it('auto-provisions a player profile on first access', function () {
    $player = userWithRole('player');

    // Laravel returns 201 automatically when a directly-returned Eloquent
    // model has wasRecentlyCreated=true (see Router::prepareResponse) — this
    // firstOrCreate() genuinely creates the profile on this first call.
    $this->actingAs($player)->getJson('/api/player-profile')->assertCreated();
    $this->assertDatabaseHas('player_profiles', ['user_id' => $player->id]);

    // Second access: the profile already exists, so this is a normal 200.
    $this->actingAs($player)->getJson('/api/player-profile')->assertOk();
});

it('updates the player profile', function () {
    $player = userWithRole('player');
    $sport = Sport::create(['name' => 'Basketball']);

    // Provision the profile first so the update itself isn't also a "created" 201.
    $this->actingAs($player)->getJson('/api/player-profile');

    $response = $this->actingAs($player)->patchJson('/api/player-profile', [
        'bio' => 'Updated bio',
        'primary_sport_id' => $sport->id,
    ]);

    $response->assertOk();
    $response->assertJsonPath('bio', 'Updated bio');
});

it('pairs two open matchmaking requests for the same sport and exposes the opponent to both sides', function () {
    $playerA = userWithRole('player');
    $playerB = userWithRole('player');
    $sport = Sport::create(['name' => 'Badminton']);

    $this->actingAs($playerA)->postJson('/api/matchmaking-requests', ['sport_id' => $sport->id])
        ->assertCreated()
        ->assertJsonPath('status', 'open');

    $this->actingAs($playerB)->postJson('/api/matchmaking-requests', ['sport_id' => $sport->id])
        ->assertCreated()
        ->assertJsonPath('status', 'matched');

    $mineA = $this->actingAs($playerA)->getJson('/api/matchmaking-requests/mine')->assertOk();
    expect($mineA->json('0.status'))->toBe('matched');
    expect($mineA->json('0.opponent.id'))->toBe($playerB->id);

    $mineB = $this->actingAs($playerB)->getJson('/api/matchmaking-requests/mine')->assertOk();
    expect($mineB->json('0.opponent.id'))->toBe($playerA->id);
});

it('does not pair requests for different sports', function () {
    $playerA = userWithRole('player');
    $playerB = userWithRole('player');
    $basketball = Sport::create(['name' => 'Basketball']);
    $badminton = Sport::create(['name' => 'Badminton']);

    $this->actingAs($playerA)->postJson('/api/matchmaking-requests', ['sport_id' => $basketball->id]);
    $response = $this->actingAs($playerB)->postJson('/api/matchmaking-requests', ['sport_id' => $badminton->id]);

    $response->assertJsonPath('status', 'open');
});

it('denies cancelling another players matchmaking request', function () {
    $playerA = userWithRole('player');
    $playerB = userWithRole('player');
    $sport = Sport::create(['name' => 'Chess']);

    $request = $this->actingAs($playerA)->postJson('/api/matchmaking-requests', ['sport_id' => $sport->id]);
    $requestId = $request->json('id');

    $this->actingAs($playerB)->deleteJson("/api/matchmaking-requests/{$requestId}")->assertForbidden();
    $this->actingAs($playerA)->deleteJson("/api/matchmaking-requests/{$requestId}")->assertNoContent();
});
