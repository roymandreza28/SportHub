<?php

use App\Models\Sport;
use App\Models\Tournament;
use App\Models\TournamentRegistration;
use App\Models\User;

it('denies tournament creation and match scoring to a non-organizer role', function () {
    $player = userWithRole('player');
    $sport = Sport::create(['name' => 'Basketball']);

    $this->actingAs($player)->postJson('/api/tournaments', [
        'sport_id' => $sport->id, 'name' => 'x', 'format' => 'round_robin', 'starts_at' => now()->addWeek(),
    ])->assertForbidden();
});

it('auto-starts an open tournament past its start time the next time tournaments are listed', function () {
    $organizer = userWithRole('organizer');
    $player = userWithRole('player');
    $sport = Sport::create(['name' => 'Basketball']);

    $tournament = Tournament::create([
        'organizer_id' => $organizer->id,
        'sport_id' => $sport->id,
        'name' => 'Auto-Start Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->subMinute(),
        'status' => 'open',
    ]);

    foreach (range(1, 2) as $i) {
        TournamentRegistration::create([
            'tournament_id' => $tournament->id,
            'user_id' => userWithRole('player')->id,
            'status' => 'pending',
        ]);
    }

    $this->actingAs($organizer)->getJson('/api/tournaments')->assertOk();

    $tournament->refresh();
    expect($tournament->status)->toBe('in_progress');
    expect($tournament->bracket)->not->toBeNull();
    expect($tournament->bracket->matches)->toHaveCount(1);

    // A player relies on 'open' to know they can still join — this must
    // never happen while an organizer just deep-links a tournament page.
    $this->assertDatabaseMissing('tournaments', ['id' => $tournament->id, 'status' => 'open']);
});

it('does not auto-start an open tournament past its start time with fewer than two registrants', function () {
    $organizer = userWithRole('organizer');
    $sport = Sport::create(['name' => 'Basketball']);

    $tournament = Tournament::create([
        'organizer_id' => $organizer->id,
        'sport_id' => $sport->id,
        'name' => 'Understaffed Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->subMinute(),
        'status' => 'open',
    ]);

    TournamentRegistration::create([
        'tournament_id' => $tournament->id,
        'user_id' => userWithRole('player')->id,
        'status' => 'pending',
    ]);

    $this->actingAs($organizer)->getJson('/api/tournaments')->assertOk();

    $tournament->refresh();
    expect($tournament->status)->toBe('open');
    expect($tournament->bracket)->toBeNull();
});

it('creates a tournament, generates a bracket, and plays it through to completion via HTTP', function () {
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');
    $sport = Sport::create(['name' => 'Basketball']);

    $create = $this->actingAs($organizer)->postJson('/api/tournaments', [
        'sport_id' => $sport->id,
        'name' => 'HTTP Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek()->toIso8601String(),
        'venue_organizer_id' => $venueOrganizer->id,
        'livestream_organizer_id' => $livestreamOrganizer->id,
    ])->assertCreated();

    $tournamentId = $create->json('id');
    $this->actingAs($organizer)->patchJson("/api/tournaments/{$tournamentId}", ['status' => 'open'])->assertOk();

    foreach (range(1, 4) as $i) {
        $player = userWithRole('player');
        TournamentRegistration::create([
            'tournament_id' => $tournamentId,
            'user_id' => $player->id,
            'status' => 'pending',
        ]);
    }

    $this->actingAs($organizer)->postJson("/api/tournaments/{$tournamentId}/generate-bracket")->assertCreated();

    // A second generation attempt must be rejected, not silently duplicate the bracket.
    $this->actingAs($organizer)->postJson("/api/tournaments/{$tournamentId}/generate-bracket")->assertStatus(422);

    $bracket = $this->actingAs($organizer)->getJson("/api/tournaments/{$tournamentId}/bracket")->assertOk();
    $round1 = $bracket->json('structure.0');
    expect($round1)->toHaveCount(2);

    foreach ($round1 as $match) {
        $this->actingAs($venueOrganizer)->patchJson("/api/matches/{$match['id']}/score", [
            'score_a' => 21, 'score_b' => 10, 'status' => 'completed',
        ])->assertOk();
    }

    $final = $this->actingAs($organizer)->getJson("/api/tournaments/{$tournamentId}/bracket")
        ->json('structure.1.0');
    expect($final['participant_a_id'])->not->toBeNull();
    expect($final['participant_b_id'])->not->toBeNull();

    $this->actingAs($venueOrganizer)->patchJson("/api/matches/{$final['id']}/score", [
        'score_a' => 15, 'score_b' => 20, 'status' => 'completed',
    ])->assertOk();

    expect(Tournament::find($tournamentId)->status)->toBe('completed');
});

it('denies scoring a match belonging to another organizers tournament', function () {
    $owner = userWithRole('organizer');
    $other = userWithRole('organizer');
    $sport = Sport::create(['name' => 'Chess']);

    $tournament = Tournament::create([
        'organizer_id' => $owner->id,
        'sport_id' => $sport->id,
        'name' => 'Owned Cup',
        'format' => 'round_robin',
        'starts_at' => now()->addWeek(),
        'status' => 'open',
    ]);

    foreach (range(1, 2) as $i) {
        $player = userWithRole('player');
        TournamentRegistration::create(['tournament_id' => $tournament->id, 'user_id' => $player->id, 'status' => 'pending']);
    }

    $this->actingAs($owner)->postJson("/api/tournaments/{$tournament->id}/generate-bracket")->assertCreated();
    $matchId = $tournament->fresh()->bracket->matches->first()->id;

    $this->actingAs($other)->patchJson("/api/matches/{$matchId}/score", ['score_a' => 1, 'score_b' => 0, 'status' => 'completed'])
        ->assertForbidden();
});

it('denies the main organizer from scoring a match in their own tournament — that is the assigned venue organizers job', function () {
    $owner = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $sport = Sport::create(['name' => 'Chess']);

    $tournament = Tournament::create([
        'organizer_id' => $owner->id,
        'sport_id' => $sport->id,
        'name' => 'Delegated Cup',
        'format' => 'round_robin',
        'starts_at' => now()->addWeek(),
        'status' => 'open',
        'venue_organizer_id' => $venueOrganizer->id,
    ]);

    foreach (range(1, 2) as $i) {
        $player = userWithRole('player');
        TournamentRegistration::create(['tournament_id' => $tournament->id, 'user_id' => $player->id, 'status' => 'pending']);
    }

    $this->actingAs($owner)->postJson("/api/tournaments/{$tournament->id}/generate-bracket")->assertCreated();
    $matchId = $tournament->fresh()->bracket->matches->first()->id;

    $this->actingAs($owner)->patchJson("/api/matches/{$matchId}/score", ['score_a' => 1, 'score_b' => 0, 'status' => 'completed'])
        ->assertForbidden();

    // The bracket itself (read-only) is still visible to the main organizer.
    $this->actingAs($owner)->getJson("/api/tournaments/{$tournament->id}/bracket")->assertOk();
});

it('requires a venue organizer and livestream organizer to be assigned when creating a tournament', function () {
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');
    $sport = Sport::create(['name' => 'Chess']);

    $this->actingAs($organizer)->postJson('/api/tournaments', [
        'sport_id' => $sport->id,
        'name' => 'Missing Staff Cup',
        'format' => 'round_robin',
        'starts_at' => now()->addWeek()->toIso8601String(),
        'livestream_organizer_id' => $livestreamOrganizer->id,
        // venue_organizer_id omitted on purpose
    ])->assertStatus(422);

    $this->actingAs($organizer)->postJson('/api/tournaments', [
        'sport_id' => $sport->id,
        'name' => 'Missing Staff Cup',
        'format' => 'round_robin',
        'starts_at' => now()->addWeek()->toIso8601String(),
        'venue_organizer_id' => $venueOrganizer->id,
        // livestream_organizer_id omitted on purpose
    ])->assertStatus(422);
});

it('publishes news and creates a livestream tied to a tournament the organizer owns', function () {
    $organizer = userWithRole('organizer');
    $sport = Sport::create(['name' => 'Volleyball']);

    $tournament = Tournament::create([
        'organizer_id' => $organizer->id,
        'sport_id' => $sport->id,
        'name' => 'Stream Cup',
        'format' => 'round_robin',
        'starts_at' => now()->addWeek(),
        'status' => 'open',
    ]);

    $this->actingAs($organizer)->postJson('/api/news', ['title' => 'Big news', 'body' => 'Details'])
        ->assertCreated();

    $this->getJson('/api/news')->assertOk()->assertJsonCount(1);

    $livestream = $this->actingAs($organizer)->postJson('/api/livestreams', [
        'tournament_id' => $tournament->id,
        'title' => 'Finals',
        'platform' => 'youtube',
        'embed_url' => 'https://youtube.com/embed/abc',
    ])->assertCreated();

    $this->actingAs($organizer)->postJson("/api/livestreams/{$livestream->json('id')}/messages", ['body' => 'hello'])
        ->assertCreated();

    $this->getJson("/api/livestreams/{$livestream->json('id')}/messages")->assertOk()->assertJsonCount(1);
});

it('lets a venue organizer score a match belonging to the tournament they were assigned to', function () {
    $owner = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $sport = Sport::create(['name' => 'Badminton']);

    $tournament = Tournament::create([
        'organizer_id' => $owner->id,
        'sport_id' => $sport->id,
        'name' => 'Venue-Run Cup',
        'format' => 'round_robin',
        'starts_at' => now()->addWeek(),
        'status' => 'open',
        'venue_organizer_id' => $venueOrganizer->id,
    ]);

    foreach (range(1, 2) as $i) {
        $player = userWithRole('player');
        TournamentRegistration::create(['tournament_id' => $tournament->id, 'user_id' => $player->id, 'status' => 'pending']);
    }

    $this->actingAs($owner)->postJson("/api/tournaments/{$tournament->id}/generate-bracket")->assertCreated();
    $matchId = $tournament->fresh()->bracket->matches->first()->id;

    $this->actingAs($venueOrganizer)->patchJson("/api/matches/{$matchId}/score", [
        'score_a' => 21, 'score_b' => 15, 'status' => 'completed',
    ])->assertOk();
});

it('denies a venue organizer from scoring a match on a tournament they were not assigned to', function () {
    $owner = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $sport = Sport::create(['name' => 'Squash']);

    $tournament = Tournament::create([
        'organizer_id' => $owner->id,
        'sport_id' => $sport->id,
        'name' => 'Unassigned Cup',
        'format' => 'round_robin',
        'starts_at' => now()->addWeek(),
        'status' => 'open',
    ]);

    foreach (range(1, 2) as $i) {
        $player = userWithRole('player');
        TournamentRegistration::create(['tournament_id' => $tournament->id, 'user_id' => $player->id, 'status' => 'pending']);
    }

    $this->actingAs($owner)->postJson("/api/tournaments/{$tournament->id}/generate-bracket")->assertCreated();
    $matchId = $tournament->fresh()->bracket->matches->first()->id;

    $this->actingAs($venueOrganizer)->patchJson("/api/matches/{$matchId}/score", [
        'score_a' => 21, 'score_b' => 15, 'status' => 'completed',
    ])->assertForbidden();
});

it('denies a venue organizer from creating tournaments or managing news', function () {
    $venueOrganizer = userWithRole('venue_organizer');
    $sport = Sport::create(['name' => 'Table Tennis']);

    $this->actingAs($venueOrganizer)->postJson('/api/tournaments', [
        'sport_id' => $sport->id, 'name' => 'x', 'format' => 'round_robin', 'starts_at' => now()->addWeek(),
    ])->assertForbidden();

    $this->actingAs($venueOrganizer)->postJson('/api/news', ['title' => 'x', 'body' => 'y'])->assertForbidden();
});

it('lets a livestream organizer create a livestream for the tournament they were assigned to', function () {
    $owner = userWithRole('organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');
    $sport = Sport::create(['name' => 'Swimming']);

    $tournament = Tournament::create([
        'organizer_id' => $owner->id,
        'sport_id' => $sport->id,
        'name' => 'Streamed Cup',
        'format' => 'round_robin',
        'starts_at' => now()->addWeek(),
        'status' => 'open',
        'livestream_organizer_id' => $livestreamOrganizer->id,
    ]);

    $this->actingAs($livestreamOrganizer)->postJson('/api/livestreams', [
        'tournament_id' => $tournament->id,
        'title' => 'Courtside feed',
        'platform' => 'youtube',
        'embed_url' => 'https://youtube.com/embed/xyz',
    ])->assertCreated();
});

it('denies a livestream organizer from creating a livestream for a tournament they were not assigned to', function () {
    $owner = userWithRole('organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');
    $sport = Sport::create(['name' => 'Rowing']);

    $tournament = Tournament::create([
        'organizer_id' => $owner->id,
        'sport_id' => $sport->id,
        'name' => 'Unassigned Stream Cup',
        'format' => 'round_robin',
        'starts_at' => now()->addWeek(),
        'status' => 'open',
    ]);

    $this->actingAs($livestreamOrganizer)->postJson('/api/livestreams', [
        'tournament_id' => $tournament->id,
        'title' => 'Hijack feed',
        'platform' => 'youtube',
        'embed_url' => 'https://youtube.com/embed/xyz',
    ])->assertForbidden();
});

it('denies a livestream organizer from scoring matches or creating tournaments', function () {
    $owner = userWithRole('organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');
    $sport = Sport::create(['name' => 'Boxing']);

    $tournament = Tournament::create([
        'organizer_id' => $owner->id,
        'sport_id' => $sport->id,
        'name' => 'No Score Access Cup',
        'format' => 'round_robin',
        'starts_at' => now()->addWeek(),
        'status' => 'open',
    ]);

    foreach (range(1, 2) as $i) {
        $player = userWithRole('player');
        TournamentRegistration::create(['tournament_id' => $tournament->id, 'user_id' => $player->id, 'status' => 'pending']);
    }

    $this->actingAs($owner)->postJson("/api/tournaments/{$tournament->id}/generate-bracket")->assertCreated();
    $matchId = $tournament->fresh()->bracket->matches->first()->id;

    $this->actingAs($livestreamOrganizer)->patchJson("/api/matches/{$matchId}/score", [
        'score_a' => 1, 'score_b' => 0, 'status' => 'completed',
    ])->assertForbidden();

    $this->actingAs($livestreamOrganizer)->postJson('/api/tournaments', [
        'sport_id' => $sport->id, 'name' => 'x', 'format' => 'round_robin', 'starts_at' => now()->addWeek(),
    ])->assertForbidden();
});

it('lets a main organizer assign a venue organizer and livestream organizer when creating a tournament', function () {
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');
    $sport = Sport::create(['name' => 'Handball']);

    $response = $this->actingAs($organizer)->postJson('/api/tournaments', [
        'sport_id' => $sport->id,
        'name' => 'Staffed Cup',
        'format' => 'round_robin',
        'starts_at' => now()->addWeek()->toIso8601String(),
        'venue_organizer_id' => $venueOrganizer->id,
        'livestream_organizer_id' => $livestreamOrganizer->id,
    ]);

    $response->assertCreated();
    expect(Tournament::find($response->json('id')))
        ->venue_organizer_id->toBe($venueOrganizer->id)
        ->livestream_organizer_id->toBe($livestreamOrganizer->id);
});

it('rejects assigning a user who does not hold the matching organizer role', function () {
    $organizer = userWithRole('organizer');
    $player = userWithRole('player');
    $livestreamOrganizer = userWithRole('livestream_organizer');
    $sport = Sport::create(['name' => 'Cricket']);

    $this->actingAs($organizer)->postJson('/api/tournaments', [
        'sport_id' => $sport->id,
        'name' => 'Bad Assignment Cup',
        'format' => 'round_robin',
        'starts_at' => now()->addWeek()->toIso8601String(),
        'venue_organizer_id' => $player->id,
        'livestream_organizer_id' => $livestreamOrganizer->id,
    ])->assertStatus(422);
});

it('lists available venue and livestream organizer accounts for assignment', function () {
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');

    $response = $this->actingAs($organizer)->getJson('/api/organizers/available');

    $response->assertOk();
    expect(collect($response->json('venue_organizers'))->pluck('id'))->toContain($venueOrganizer->id);
    expect(collect($response->json('livestream_organizers'))->pluck('id'))->toContain($livestreamOrganizer->id);
});

it('denies creating a livestream tied to a tournament the organizer does not own', function () {
    $owner = userWithRole('organizer');
    $other = userWithRole('organizer');
    $sport = Sport::create(['name' => 'Football']);

    $tournament = Tournament::create([
        'organizer_id' => $owner->id,
        'sport_id' => $sport->id,
        'name' => 'Owned Cup',
        'format' => 'round_robin',
        'starts_at' => now()->addWeek(),
        'status' => 'open',
    ]);

    $this->actingAs($other)->postJson('/api/livestreams', [
        'tournament_id' => $tournament->id,
        'title' => 'Hijack Stream',
        'platform' => 'youtube',
        'embed_url' => 'https://youtube.com/embed/abc',
    ])->assertForbidden();
});

// ---- Best-of-sets scoring (table tennis "Best of 5/7 Sets", volleyball "Best of Series") ----

it('requires sets_to_win when scoring_type is best_of_sets', function () {
    $organizer = userWithRole('organizer');
    $sport = Sport::create(['name' => 'Table Tennis']);

    $this->actingAs($organizer)->postJson('/api/tournaments', [
        'sport_id' => $sport->id,
        'name' => 'Sets Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek(),
        'scoring_type' => 'best_of_sets',
    ])->assertStatus(422);
});

it('creates a tournament with best_of_sets scoring via HTTP', function () {
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');
    $sport = Sport::create(['name' => 'Table Tennis']);

    $response = $this->actingAs($organizer)->postJson('/api/tournaments', [
        'sport_id' => $sport->id,
        'name' => 'Sets Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek(),
        'scoring_type' => 'best_of_sets',
        'sets_to_win' => 3,
        'venue_organizer_id' => $venueOrganizer->id,
        'livestream_organizer_id' => $livestreamOrganizer->id,
    ]);

    $response->assertCreated();
    expect(Tournament::find($response->json('id')))
        ->scoring_type->toBe('best_of_sets')
        ->sets_to_win->toBe(3);
});

it('completes a best_of_sets match once a side reaches sets_to_win and advances the bracket', function () {
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $sport = Sport::create(['name' => 'Table Tennis']);

    $tournament = Tournament::create([
        'organizer_id' => $organizer->id,
        'sport_id' => $sport->id,
        'name' => 'Sets Cup',
        'format' => 'single_elimination',
        'scoring_type' => 'best_of_sets',
        'sets_to_win' => 2, // best of 3
        'starts_at' => now()->addWeek(),
        'status' => 'open',
        'venue_organizer_id' => $venueOrganizer->id,
    ]);

    foreach (range(1, 2) as $i) {
        $player = userWithRole('player');
        TournamentRegistration::create(['tournament_id' => $tournament->id, 'user_id' => $player->id, 'status' => 'pending']);
    }

    $this->actingAs($organizer)->postJson("/api/tournaments/{$tournament->id}/generate-bracket")->assertCreated();
    $match = $tournament->fresh()->bracket->matches->first();

    // First set: not decided yet (1-0 in sets, needs 2).
    $this->actingAs($venueOrganizer)->patchJson("/api/matches/{$match->id}/score", [
        'sets' => [['score_a' => 11, 'score_b' => 8]],
    ])->assertOk()
        ->assertJsonPath('status', 'live')
        ->assertJsonPath('score_a', 1)
        ->assertJsonPath('score_b', 0);

    expect($tournament->fresh()->status)->toBe('in_progress');

    // Second set clinches it 2-0.
    $response = $this->actingAs($venueOrganizer)->patchJson("/api/matches/{$match->id}/score", [
        'sets' => [['score_a' => 11, 'score_b' => 8], ['score_a' => 11, 'score_b' => 9]],
    ]);

    $response->assertOk();
    $response->assertJsonPath('status', 'completed');
    $response->assertJsonPath('score_a', 2);
    $response->assertJsonPath('score_b', 0);
    expect($response->json('winner_id'))->toBe($match->participant_a_id);

    // Only 2 entrants -> that single match decides the whole tournament.
    expect($tournament->fresh()->status)->toBe('completed');
});

it('does not complete a best_of_sets match before the deciding set is reached', function () {
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $sport = Sport::create(['name' => 'Volleyball']);

    $tournament = Tournament::create([
        'organizer_id' => $organizer->id,
        'sport_id' => $sport->id,
        'name' => 'Series Cup',
        'format' => 'single_elimination',
        'scoring_type' => 'best_of_sets',
        'sets_to_win' => 3, // best of 5
        'starts_at' => now()->addWeek(),
        'status' => 'open',
        'venue_organizer_id' => $venueOrganizer->id,
    ]);

    foreach (range(1, 2) as $i) {
        $player = userWithRole('player');
        TournamentRegistration::create(['tournament_id' => $tournament->id, 'user_id' => $player->id, 'status' => 'pending']);
    }

    $this->actingAs($organizer)->postJson("/api/tournaments/{$tournament->id}/generate-bracket")->assertCreated();
    $match = $tournament->fresh()->bracket->matches->first();

    $response = $this->actingAs($venueOrganizer)->patchJson("/api/matches/{$match->id}/score", [
        'sets' => [
            ['score_a' => 25, 'score_b' => 20],
            ['score_a' => 25, 'score_b' => 18],
        ],
    ]);

    $response->assertOk();
    $response->assertJsonPath('status', 'live');
    $response->assertJsonPath('score_a', 2);
    expect($tournament->fresh()->status)->toBe('in_progress');
});
