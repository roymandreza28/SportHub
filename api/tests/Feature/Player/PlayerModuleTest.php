<?php

use App\Models\PlayerProfile;
use App\Models\Sport;
use App\Models\SkillLevel;
use App\Models\SportFormat;

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
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => 'Singles', 'players_per_side' => 1]);

    $this->actingAs($playerA)->postJson('/api/matchmaking-requests', ['sport_id' => $sport->id, 'sport_format_id' => $format->id])
        ->assertCreated()
        ->assertJsonPath('status', 'open');

    $this->actingAs($playerB)->postJson('/api/matchmaking-requests', ['sport_id' => $sport->id, 'sport_format_id' => $format->id])
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
    $basketballFormat = SportFormat::create(['sport_id' => $basketball->id, 'name' => 'Pickup', 'players_per_side' => 1]);
    $badmintonFormat = SportFormat::create(['sport_id' => $badminton->id, 'name' => 'Singles', 'players_per_side' => 1]);

    $this->actingAs($playerA)->postJson('/api/matchmaking-requests', [
        'sport_id' => $basketball->id,
        'sport_format_id' => $basketballFormat->id,
    ]);
    $response = $this->actingAs($playerB)->postJson('/api/matchmaking-requests', [
        'sport_id' => $badminton->id,
        'sport_format_id' => $badmintonFormat->id,
    ]);

    $response->assertJsonPath('status', 'open');
});

it('pairs players who share the same skill tier for the sport', function () {
    $playerA = userWithRole('player');
    $playerB = userWithRole('player');
    $sport = Sport::create(['name' => 'Volleyball']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => '6v6', 'players_per_side' => 6]);

    $profileA = PlayerProfile::create(['user_id' => $playerA->id]);
    $profileB = PlayerProfile::create(['user_id' => $playerB->id]);

    SkillLevel::create(['player_profile_id' => $profileA->id, 'sport_id' => $sport->id, 'level' => 'casual_player']);
    SkillLevel::create(['player_profile_id' => $profileB->id, 'sport_id' => $sport->id, 'level' => 'casual_player']);

    $teamA = createReadyTeam($playerA, $sport, $format);
    $teamB = createReadyTeam($playerB, $sport, $format);

    $this->actingAs($playerA)->postJson('/api/matchmaking-requests', [
        'sport_id' => $sport->id, 'sport_format_id' => $format->id, 'team_id' => $teamA->id,
    ])->assertJsonPath('status', 'open');

    $this->actingAs($playerB)->postJson('/api/matchmaking-requests', [
        'sport_id' => $sport->id, 'sport_format_id' => $format->id, 'team_id' => $teamB->id,
    ])->assertJsonPath('status', 'matched');
});

it('does not pair players with different skill tiers for the same sport', function () {
    $playerA = userWithRole('player');
    $playerB = userWithRole('player');
    $sport = Sport::create(['name' => 'Table Tennis']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => 'Singles', 'players_per_side' => 1]);

    $profileA = PlayerProfile::create(['user_id' => $playerA->id]);
    $profileB = PlayerProfile::create(['user_id' => $playerB->id]);

    SkillLevel::create(['player_profile_id' => $profileA->id, 'sport_id' => $sport->id, 'level' => 'beginner']);
    SkillLevel::create(['player_profile_id' => $profileB->id, 'sport_id' => $sport->id, 'level' => 'competitive_athlete']);

    $this->actingAs($playerA)->postJson('/api/matchmaking-requests', ['sport_id' => $sport->id, 'sport_format_id' => $format->id])
        ->assertJsonPath('status', 'open');

    $this->actingAs($playerB)->postJson('/api/matchmaking-requests', ['sport_id' => $sport->id, 'sport_format_id' => $format->id])
        ->assertJsonPath('status', 'open');
});

it('does not pair an unassessed player with an assessed player for the same sport', function () {
    $playerA = userWithRole('player');
    $playerB = userWithRole('player');
    $sport = Sport::create(['name' => 'Swimming']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => 'Individual', 'players_per_side' => 1]);

    $profileB = PlayerProfile::create(['user_id' => $playerB->id]);
    SkillLevel::create(['player_profile_id' => $profileB->id, 'sport_id' => $sport->id, 'level' => 'developing_athlete']);

    $this->actingAs($playerA)->postJson('/api/matchmaking-requests', ['sport_id' => $sport->id, 'sport_format_id' => $format->id])
        ->assertJsonPath('status', 'open');

    $this->actingAs($playerB)->postJson('/api/matchmaking-requests', ['sport_id' => $sport->id, 'sport_format_id' => $format->id])
        ->assertJsonPath('status', 'open');
});

it('denies cancelling another players matchmaking request', function () {
    $playerA = userWithRole('player');
    $playerB = userWithRole('player');
    $sport = Sport::create(['name' => 'Chess']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => 'Individual', 'players_per_side' => 1]);

    $request = $this->actingAs($playerA)->postJson('/api/matchmaking-requests', ['sport_id' => $sport->id, 'sport_format_id' => $format->id]);
    $requestId = $request->json('id');

    $this->actingAs($playerB)->deleteJson("/api/matchmaking-requests/{$requestId}")->assertForbidden();
    $this->actingAs($playerA)->deleteJson("/api/matchmaking-requests/{$requestId}")->assertNoContent();
});
