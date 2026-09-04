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
        'status' => 'registration',
    ]);

    $this->actingAs($coach)->postJson("/api/tournaments/{$tournament->id}/registrations", ['user_id' => $player->id])
        ->assertCreated();

    $this->actingAs($coach)->postJson("/api/tournaments/{$tournament->id}/registrations", ['user_id' => $player->id])
        ->assertStatus(422);
});

it('rejects a coach registering a second, different player for a tournament they already registered someone for', function () {
    $coach = userWithRole('coach');
    $playerA = userWithRole('player');
    $playerB = userWithRole('player');
    $organizer = userWithRole('organizer');
    $sport = Sport::create(['name' => 'Table Tennis']);

    $tournament = Tournament::create([
        'organizer_id' => $organizer->id,
        'sport_id' => $sport->id,
        'name' => 'Singles Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek(),
        'status' => 'registration',
    ]);

    $this->actingAs($coach)->postJson("/api/tournaments/{$tournament->id}/registrations", ['user_id' => $playerA->id])
        ->assertCreated();

    $response = $this->actingAs($coach)->postJson("/api/tournaments/{$tournament->id}/registrations", ['user_id' => $playerB->id]);
    $response->assertStatus(422);
    expect($response->json('message'))->toContain('already registered a player');

    $this->assertDatabaseMissing('tournament_registrations', ['tournament_id' => $tournament->id, 'user_id' => $playerB->id]);
});

it('makes a freshly-created tournament visible to coaches only after the organizer opens it for registration', function () {
    $coach = userWithRole('coach');
    $player = userWithRole('player');
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');
    $sport = Sport::create(['name' => 'Basketball']);

    // Mirrors the real flow: POST /api/tournaments never accepts a status
    // field and always creates a draft (TournamentController::store()).
    $create = $this->actingAs($organizer)->postJson('/api/tournaments', [
        'sport_id' => $sport->id,
        'name' => 'Freshly Created Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek()->toIso8601String(),
        'venue_organizer_id' => $venueOrganizer->id,
        'livestream_organizer_id' => $livestreamOrganizer->id,
    ]);
    $create->assertCreated();
    expect($create->json('status'))->toBe('draft');
    $tournamentId = $create->json('id');

    // The coach module only ever fetches ?status=registration — a draft
    // tournament must not appear there, or a coach could try to register for
    // a tournament the organizer hasn't finished setting up yet.
    $beforeOpen = $this->actingAs($coach)->getJson('/api/tournaments?status=registration');
    expect(collect($beforeOpen->json())->pluck('id'))->not->toContain($tournamentId);

    // The organizer explicitly opens registration (the step that was
    // previously missing from the frontend entirely).
    $this->actingAs($organizer)->patchJson("/api/tournaments/{$tournamentId}", ['status' => 'registration'])
        ->assertOk()
        ->assertJsonPath('status', 'registration');

    $afterOpen = $this->actingAs($coach)->getJson('/api/tournaments?status=registration');
    expect(collect($afterOpen->json())->pluck('id'))->toContain($tournamentId);

    $this->actingAs($coach)->postJson("/api/tournaments/{$tournamentId}/registrations", ['user_id' => $player->id])
        ->assertCreated();
});

it('lists only the registrations a coach created, not registrations made by other coaches', function () {
    $coach = userWithRole('coach');
    $otherCoach = userWithRole('coach');
    $player = userWithRole('player');
    $otherPlayer = userWithRole('player');
    $organizer = userWithRole('organizer');
    $sport = Sport::create(['name' => 'Basketball']);

    $tournament = Tournament::create([
        'organizer_id' => $organizer->id,
        'sport_id' => $sport->id,
        'name' => 'Open Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek(),
        'status' => 'registration',
    ]);

    $this->actingAs($coach)->postJson("/api/tournaments/{$tournament->id}/registrations", ['user_id' => $player->id])
        ->assertCreated();
    $this->actingAs($otherCoach)->postJson("/api/tournaments/{$tournament->id}/registrations", ['user_id' => $otherPlayer->id])
        ->assertCreated();

    $mine = $this->actingAs($coach)->getJson('/api/tournament-registrations/mine')->assertOk();

    expect($mine->json())->toHaveCount(1);
    expect($mine->json('0.user.id'))->toBe($player->id);
    expect($mine->json('0.tournament.id'))->toBe($tournament->id);
});

it('denies tournament registration to a coach whose account is still pending verification', function () {
    $coach = userWithRole('coach');
    $coach->update(['verification_status' => 'pending']);
    $player = userWithRole('player');
    $organizer = userWithRole('organizer');
    $sport = Sport::create(['name' => 'Basketball']);

    $tournament = Tournament::create([
        'organizer_id' => $organizer->id,
        'sport_id' => $sport->id,
        'name' => 'Open Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek(),
        'status' => 'registration',
    ]);

    $this->actingAs($coach)->postJson("/api/tournaments/{$tournament->id}/registrations", ['user_id' => $player->id])
        ->assertStatus(403);
});

it('rejects registration for a tournament that is not draft or registration', function () {
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
        'level' => 'casual_player',
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
        'level' => 'casual_player',
        'score' => 55,
    ]);
});

it('accepts the professional tier, added for Bowling\'s PBA/international-tour level', function () {
    $coach = userWithRole('coach');
    $player = userWithRole('player');
    $sport = Sport::create(['name' => 'Bowling']);

    $this->actingAs($coach)->postJson('/api/evaluations', [
        'player_id' => $player->id,
        'sport_id' => $sport->id,
        'level' => 'professional',
        'score' => 98,
    ])->assertCreated();

    $this->assertDatabaseHas('skill_levels', [
        'player_profile_id' => $player->fresh()->playerProfile->id,
        'level' => 'professional',
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
        'level' => 'developing_athlete',
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
        'level' => 'competitive_athlete',
    ])->assertForbidden();
});
