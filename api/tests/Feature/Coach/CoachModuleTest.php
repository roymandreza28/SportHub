<?php

use App\Models\Sport;
use App\Models\Tournament;
use App\Models\User;

it('lets a coach register a player for an open tournament and rejects duplicate registration', function () {
    $coach = userWithRole('coach');
    $player = userWithRole('player');
    $organizer = userWithRole('organizer');
    $sport = Sport::create(['name' => 'Basketball']);

    $tournament = Tournament::create([
        'organizer_id' => $organizer->id,
        'sport_id' => $sport->id,
        'name' => 'Open Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek(),
        'status' => 'open',
    ]);

    $this->actingAs($coach)->postJson("/api/tournaments/{$tournament->id}/registrations", ['user_id' => $player->id])
        ->assertCreated();

    $this->actingAs($coach)->postJson("/api/tournaments/{$tournament->id}/registrations", ['user_id' => $player->id])
        ->assertStatus(422);
});

it('rejects registration for a tournament that is not draft or open', function () {
    $coach = userWithRole('coach');
    $player = userWithRole('player');
    $organizer = userWithRole('organizer');
    $sport = Sport::create(['name' => 'Basketball']);

    $tournament = Tournament::create([
        'organizer_id' => $organizer->id,
        'sport_id' => $sport->id,
        'name' => 'Closed Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek(),
        'status' => 'completed',
    ]);

    $this->actingAs($coach)->postJson("/api/tournaments/{$tournament->id}/registrations", ['user_id' => $player->id])
        ->assertStatus(422);
});

it('creates an evaluation that upserts the current skill level and keeps prior evaluations as history', function () {
    $coach = userWithRole('coach');
    $player = userWithRole('player');
    $sport = Sport::create(['name' => 'Badminton']);

    $this->actingAs($coach)->postJson('/api/evaluations', [
        'player_id' => $player->id,
        'sport_id' => $sport->id,
        'level' => 'beginner',
        'score' => 40,
        'notes' => 'First session',
    ])->assertCreated();

    $second = $this->actingAs($coach)->postJson('/api/evaluations', [
        'player_id' => $player->id,
        'sport_id' => $sport->id,
        'level' => 'intermediate',
        'score' => 55,
        'notes' => 'Improved',
    ])->assertCreated();

    // Same skill_level_id both times — the second evaluation updated the
    // existing row rather than creating a duplicate skill level.
    $firstSkillLevelId = $this->actingAs($coach)
        ->getJson("/api/evaluations?player_id={$player->id}")
        ->json('1.skill_level_id');
    expect($second->json('skill_level_id'))->toBe($firstSkillLevelId);

    $this->assertDatabaseCount('skill_levels', 1);
    $this->assertDatabaseCount('evaluations', 2);

    $this->assertDatabaseHas('skill_levels', [
        'player_profile_id' => $player->fresh()->playerProfile->id,
        'level' => 'intermediate',
        'score' => 55,
    ]);
});

it('auto-provisions a player profile when evaluating a player who never touched theirs', function () {
    $coach = userWithRole('coach');
    $player = User::factory()->create();
    $player->assignRole('player');
    $sport = Sport::create(['name' => 'Chess']);

    $this->actingAs($coach)->postJson('/api/evaluations', [
        'player_id' => $player->id,
        'sport_id' => $sport->id,
        'level' => 'advanced',
    ])->assertCreated();

    $this->assertDatabaseHas('player_profiles', ['user_id' => $player->id]);
});

it('denies evaluation creation to a non-coach role', function () {
    $player = userWithRole('player');
    $otherPlayer = userWithRole('player');
    $sport = Sport::create(['name' => 'Tennis']);

    $this->actingAs($player)->postJson('/api/evaluations', [
        'player_id' => $otherPlayer->id,
        'sport_id' => $sport->id,
        'level' => 'pro',
    ])->assertForbidden();
});
