<?php

use App\Models\Court;
use App\Models\Livestream;
use App\Models\News;
use App\Models\Sport;
use App\Models\Tournament;
use App\Models\TournamentRegistration;
use App\Models\User;
use App\Models\Venue;
use App\Services\BracketService;

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
        'status' => 'registration',
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
    expect($tournament->status)->toBe('preparation');
    expect($tournament->bracket)->not->toBeNull();
    expect($tournament->bracket->matches)->toHaveCount(1);

    // A player relies on 'registration' to know they can still join — this
    // must never happen while an organizer just deep-links a tournament page.
    $this->assertDatabaseMissing('tournaments', ['id' => $tournament->id, 'status' => 'registration']);
});

it('moves a tournament past its start time to preparation without generating a bracket when there are fewer than two registrants', function () {
    $organizer = userWithRole('organizer');
    $sport = Sport::create(['name' => 'Basketball']);

    $tournament = Tournament::create([
        'organizer_id' => $organizer->id,
        'sport_id' => $sport->id,
        'name' => 'Understaffed Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->subMinute(),
        'status' => 'registration',
    ]);

    TournamentRegistration::create([
        'tournament_id' => $tournament->id,
        'user_id' => userWithRole('player')->id,
        'status' => 'pending',
    ]);

    $this->actingAs($organizer)->getJson('/api/tournaments')->assertOk();

    $tournament->refresh();
    expect($tournament->status)->toBe('preparation');
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
    $this->actingAs($organizer)->patchJson("/api/tournaments/{$tournamentId}", ['status' => 'registration'])->assertOk();

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
    // The frontend's portrait "pyramid" bracket layout keys off this — see
    // BracketView.tsx.
    expect($bracket->json('format'))->toBe('single_elimination');
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

it('rejects generating a bracket with fewer than 2 registrants, leaving no orphaned bracket row', function () {
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');
    $sport = Sport::create(['name' => 'Basketball']);

    $create = $this->actingAs($organizer)->postJson('/api/tournaments', [
        'sport_id' => $sport->id,
        'name' => 'Empty Cup',
        'format' => 'double_elimination',
        'starts_at' => now()->addWeek()->toIso8601String(),
        'venue_organizer_id' => $venueOrganizer->id,
        'livestream_organizer_id' => $livestreamOrganizer->id,
    ])->assertCreated();

    $tournamentId = $create->json('id');

    // Zero registrants — must be rejected before BracketService ever runs,
    // not left to crash mid-generation and leave a structureless Bracket row.
    $this->actingAs($organizer)->postJson("/api/tournaments/{$tournamentId}/generate-bracket")->assertStatus(422);

    expect(Tournament::find($tournamentId)->bracket)->toBeNull();
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
        'status' => 'registration',
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
        'status' => 'registration',
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
        'status' => 'registration',
    ]);

    $this->actingAs($organizer)->postJson('/api/news', ['title' => 'Big news', 'body' => 'Details'])
        ->assertCreated();

    $this->getJson('/api/news')->assertOk()->assertJsonCount(1);

    $livestream = $this->actingAs($organizer)->postJson('/api/livestreams', [
        'tournament_id' => $tournament->id,
        'title' => 'Finals',
    ])->assertCreated();

    $this->actingAs($organizer)->postJson("/api/livestreams/{$livestream->json('id')}/messages", ['body' => 'hello'])
        ->assertCreated();

    $this->getJson("/api/livestreams/{$livestream->json('id')}/messages")->assertOk()->assertJsonCount(1);
});

it('relays a WebRTC signal to its target and flips livestream status only when the broadcaster sends start/end', function () {
    $owner = userWithRole('organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');
    $viewer = userWithRole('player');
    $sport = Sport::create(['name' => 'Chess']);

    $tournament = Tournament::create([
        'organizer_id' => $owner->id,
        'sport_id' => $sport->id,
        'name' => 'Signal Cup',
        'format' => 'round_robin',
        'starts_at' => now()->addWeek(),
        'status' => 'registration',
        'livestream_organizer_id' => $livestreamOrganizer->id,
    ]);

    $livestream = $this->actingAs($owner)->postJson('/api/livestreams', [
        'tournament_id' => $tournament->id,
        'title' => 'Finals feed',
    ])->assertCreated();
    $livestreamId = $livestream->json('id');
    expect($livestream->json('broadcaster_id'))->toBe($livestreamOrganizer->id);

    // A non-broadcaster sending "broadcast-started" relays fine but has no
    // status side-effect.
    $this->actingAs($viewer)->postJson("/api/livestreams/{$livestreamId}/signal", [
        'target_user_id' => $livestreamOrganizer->id,
        'type' => 'broadcast-started',
        'data' => ['sdp' => 'irrelevant'],
    ])->assertNoContent();
    expect(Livestream::find($livestreamId)->status)->toBe('scheduled');

    // The assigned broadcaster starting really does flip status to live.
    $this->actingAs($livestreamOrganizer)->postJson("/api/livestreams/{$livestreamId}/signal", [
        'target_user_id' => $livestreamOrganizer->id,
        'type' => 'broadcast-started',
        'data' => [],
    ])->assertNoContent();
    expect(Livestream::find($livestreamId)->status)->toBe('live');

    // An offer/answer/ice-candidate signal is just relayed, no status change.
    $this->actingAs($livestreamOrganizer)->postJson("/api/livestreams/{$livestreamId}/signal", [
        'target_user_id' => $viewer->id,
        'type' => 'offer',
        'data' => ['sdp' => 'v=0...'],
    ])->assertNoContent();
    expect(Livestream::find($livestreamId)->status)->toBe('live');

    // Ending, from the broadcaster, flips it to ended.
    $this->actingAs($livestreamOrganizer)->postJson("/api/livestreams/{$livestreamId}/signal", [
        'target_user_id' => $livestreamOrganizer->id,
        'type' => 'broadcast-ended',
        'data' => [],
    ])->assertNoContent();
    expect(Livestream::find($livestreamId)->status)->toBe('ended');
});

it('validates the WebRTC signal payload', function () {
    $owner = userWithRole('organizer');
    $sport = Sport::create(['name' => 'Chess']);

    $tournament = Tournament::create([
        'organizer_id' => $owner->id, 'sport_id' => $sport->id,
        'name' => 'Bad Signal Cup', 'format' => 'round_robin', 'starts_at' => now()->addWeek(), 'status' => 'registration',
    ]);
    $livestream = $this->actingAs($owner)->postJson('/api/livestreams', [
        'tournament_id' => $tournament->id, 'title' => 'Feed',
    ])->assertCreated();

    $this->actingAs($owner)->postJson("/api/livestreams/{$livestream->json('id')}/signal", [
        'target_user_id' => $owner->id,
        'type' => 'not-a-real-type',
        'data' => [],
    ])->assertStatus(422);

    $this->actingAs($owner)->postJson("/api/livestreams/{$livestream->json('id')}/signal", [
        'type' => 'offer',
        'data' => [],
    ])->assertStatus(422);
});

it('denies signaling to a guest', function () {
    $owner = userWithRole('organizer');
    $sport = Sport::create(['name' => 'Chess']);

    $tournament = Tournament::create([
        'organizer_id' => $owner->id, 'sport_id' => $sport->id,
        'name' => 'Guest Signal Cup', 'format' => 'round_robin', 'starts_at' => now()->addWeek(), 'status' => 'registration',
    ]);
    // Created directly via Eloquent, not through an authenticated HTTP
    // call — actingAs() would otherwise leave this test's guard
    // authenticated for the rest of the test, defeating the point.
    $livestream = Livestream::create([
        'tournament_id' => $tournament->id, 'title' => 'Feed',
        'broadcaster_id' => $owner->id, 'status' => 'scheduled',
    ]);

    $this->postJson("/api/livestreams/{$livestream->id}/signal", [
        'target_user_id' => $owner->id,
        'type' => 'offer',
        'data' => [],
    ])->assertStatus(401);
});

it('lets the main organizer publish a livestream to the newsfeed, creating a linked News article', function () {
    $owner = userWithRole('organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');
    $sport = Sport::create(['name' => 'Chess']);

    $tournament = Tournament::create([
        'organizer_id' => $owner->id, 'sport_id' => $sport->id,
        'name' => 'Publish Cup', 'format' => 'round_robin', 'starts_at' => now()->addWeek(), 'status' => 'registration',
        'livestream_organizer_id' => $livestreamOrganizer->id,
    ]);
    $livestream = $this->actingAs($owner)->postJson('/api/livestreams', [
        'tournament_id' => $tournament->id, 'title' => 'Finals feed',
    ])->assertCreated();

    $response = $this->actingAs($owner)->postJson("/api/livestreams/{$livestream->json('id')}/publish", [
        'title' => 'Live from the finals!',
        'body' => 'Catch the championship match as it happens.',
    ])->assertOk();

    expect($response->json('news_id'))->not->toBeNull();
    expect($response->json('news.title'))->toBe('Live from the finals!');
    $this->assertDatabaseHas('news', [
        'id' => $response->json('news_id'), 'author_id' => $owner->id, 'title' => 'Live from the finals!',
    ]);
});

it('denies publishing a livestream to news by anyone other than the tournaments main organizer', function () {
    $owner = userWithRole('organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');
    $sport = Sport::create(['name' => 'Chess']);

    $tournament = Tournament::create([
        'organizer_id' => $owner->id, 'sport_id' => $sport->id,
        'name' => 'No Publish Cup', 'format' => 'round_robin', 'starts_at' => now()->addWeek(), 'status' => 'registration',
        'livestream_organizer_id' => $livestreamOrganizer->id,
    ]);
    $livestream = $this->actingAs($owner)->postJson('/api/livestreams', [
        'tournament_id' => $tournament->id, 'title' => 'Finals feed',
    ])->assertCreated();

    $this->actingAs($livestreamOrganizer)->postJson("/api/livestreams/{$livestream->json('id')}/publish", [
        'title' => 'Hijacked feed', 'body' => 'x',
    ])->assertForbidden();
});

it('relays a public signal only for a livestream that is live and published, reaching anonymous callers', function () {
    $owner = userWithRole('organizer');
    $sport = Sport::create(['name' => 'Chess']);

    $tournament = Tournament::create([
        'organizer_id' => $owner->id, 'sport_id' => $sport->id,
        'name' => 'Relay Cup', 'format' => 'round_robin', 'starts_at' => now()->addWeek(), 'status' => 'registration',
    ]);
    $livestream = Livestream::create([
        'tournament_id' => $tournament->id, 'title' => 'Feed',
        'broadcaster_id' => $owner->id, 'status' => 'scheduled',
    ]);

    // Not yet published/live — anonymous relay is refused.
    $this->postJson("/api/livestreams/{$livestream->id}/public-signal", [
        'from_token' => 'viewer-1', 'target_token' => 'organizer', 'type' => 'join', 'data' => [],
    ])->assertStatus(404);

    $news = News::create(['author_id' => $owner->id, 'title' => 'x', 'body' => 'y', 'published_at' => now()]);
    $livestream->update(['news_id' => $news->id, 'status' => 'live']);

    // No auth header at all — a genuinely anonymous request.
    $this->postJson("/api/livestreams/{$livestream->id}/public-signal", [
        'from_token' => 'viewer-1', 'target_token' => 'organizer', 'type' => 'join', 'data' => [],
    ])->assertNoContent();
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
        'status' => 'registration',
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
        'status' => 'registration',
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

it('denies a venue organizer from creating tournaments, but still lets them post news', function () {
    $venueOrganizer = userWithRole('venue_organizer');
    $sport = Sport::create(['name' => 'Table Tennis']);

    $this->actingAs($venueOrganizer)->postJson('/api/tournaments', [
        'sport_id' => $sport->id, 'name' => 'x', 'format' => 'round_robin', 'starts_at' => now()->addWeek(),
    ])->assertForbidden();

    // Newsfeed posting is deliberately open to the whole organizer family
    // (see NewsAccessTest) — only tournament management stays main-organizer-only.
    $this->actingAs($venueOrganizer)->postJson('/api/news', ['title' => 'x', 'body' => 'y'])->assertCreated();
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
        'status' => 'registration',
        'livestream_organizer_id' => $livestreamOrganizer->id,
    ]);

    $this->actingAs($livestreamOrganizer)->postJson('/api/livestreams', [
        'tournament_id' => $tournament->id,
        'title' => 'Courtside feed',
    ])->assertCreated()->assertJsonPath('broadcaster_id', $livestreamOrganizer->id);
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
        'status' => 'registration',
    ]);

    $this->actingAs($livestreamOrganizer)->postJson('/api/livestreams', [
        'tournament_id' => $tournament->id,
        'title' => 'Hijack feed',
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
        'status' => 'registration',
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
        'status' => 'registration',
    ]);

    $this->actingAs($other)->postJson('/api/livestreams', [
        'tournament_id' => $tournament->id,
        'title' => 'Hijack Stream',
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
        'status' => 'registration',
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

    expect($tournament->fresh()->status)->toBe('preparation');

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
        'status' => 'registration',
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
    expect($tournament->fresh()->status)->toBe('preparation');
});

// ---- Tournament lifecycle: draft -> registration -> auto-started prep -> proceed -> ongoing -> completed ----

it('runs a tournament through its full lifecycle from draft to a crowned champion', function () {
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');
    $sport = Sport::create(['name' => 'Chess']);

    $create = $this->actingAs($organizer)->postJson('/api/tournaments', [
        'sport_id' => $sport->id,
        'name' => 'Lifecycle Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek()->toIso8601String(),
        'venue_organizer_id' => $venueOrganizer->id,
        'livestream_organizer_id' => $livestreamOrganizer->id,
    ])->assertCreated();
    $tournamentId = $create->json('id');
    expect(Tournament::find($tournamentId)->status)->toBe('draft');

    $this->actingAs($organizer)->patchJson("/api/tournaments/{$tournamentId}", ['status' => 'registration'])->assertOk();

    foreach (range(1, 2) as $i) {
        $player = userWithRole('player');
        TournamentRegistration::create(['tournament_id' => $tournamentId, 'user_id' => $player->id, 'status' => 'pending']);
    }

    // Simulate the deadline having passed since registration opened.
    Tournament::find($tournamentId)->update(['starts_at' => now()->subMinute()]);

    $this->actingAs($organizer)->getJson('/api/tournaments')->assertOk();

    $tournament = Tournament::find($tournamentId);
    expect($tournament->status)->toBe('preparation');
    expect($tournament->bracket)->not->toBeNull();

    $this->actingAs($organizer)->postJson("/api/tournaments/{$tournamentId}/proceed")->assertOk();
    expect(Tournament::find($tournamentId)->status)->toBe('ongoing');

    $match = $tournament->bracket->matches->first();
    $this->actingAs($venueOrganizer)->patchJson("/api/matches/{$match->id}/score", [
        'score_a' => 21, 'score_b' => 10, 'status' => 'completed',
    ])->assertOk();

    $final = Tournament::find($tournamentId);
    expect($final->status)->toBe('completed');
    expect($final->champion_id)->not->toBeNull();
    expect($final->champion_id)->toBe($match->fresh()->winner_id);

    $this->assertDatabaseHas('notifications', [
        'user_id' => $organizer->id,
        'type' => 'tournament_champion_crowned',
    ]);
});

it('cancels a tournament from registration or preparation, but rejects cancellation from draft, ongoing, or completed', function () {
    $organizer = userWithRole('organizer');
    $sport = Sport::create(['name' => 'Chess']);

    $makeTournament = fn (string $status) => Tournament::create([
        'organizer_id' => $organizer->id, 'sport_id' => $sport->id,
        'name' => 'Cancel Cup', 'format' => 'single_elimination', 'starts_at' => now()->addWeek(), 'status' => $status,
    ]);

    $this->actingAs($organizer)->postJson('/api/tournaments/'.$makeTournament('draft')->id.'/cancel')->assertStatus(422);

    $registration = $makeTournament('registration');
    $player = userWithRole('player');
    TournamentRegistration::create(['tournament_id' => $registration->id, 'user_id' => $player->id, 'status' => 'pending']);
    $this->actingAs($organizer)->postJson("/api/tournaments/{$registration->id}/cancel")->assertOk();
    expect($registration->fresh()->status)->toBe('cancelled');
    $this->assertDatabaseHas('notifications', ['user_id' => $player->id, 'type' => 'tournament_update']);

    $preparation = $makeTournament('preparation');
    $this->actingAs($organizer)->postJson("/api/tournaments/{$preparation->id}/cancel")->assertOk();
    expect($preparation->fresh()->status)->toBe('cancelled');

    $this->actingAs($organizer)->postJson('/api/tournaments/'.$makeTournament('ongoing')->id.'/cancel')->assertStatus(422);
    $this->actingAs($organizer)->postJson('/api/tournaments/'.$makeTournament('completed')->id.'/cancel')->assertStatus(422);
});

it('rejects proceed unless the tournament is in preparation with a generated bracket', function () {
    $organizer = userWithRole('organizer');
    $sport = Sport::create(['name' => 'Chess']);

    $registration = Tournament::create([
        'organizer_id' => $organizer->id, 'sport_id' => $sport->id,
        'name' => 'Proceed Cup', 'format' => 'single_elimination', 'starts_at' => now()->addWeek(), 'status' => 'registration',
    ]);
    $this->actingAs($organizer)->postJson("/api/tournaments/{$registration->id}/proceed")->assertStatus(422);

    // Fewer than two registrants at the deadline auto-transitions straight
    // to preparation without ever generating a bracket (see BracketService).
    $understaffed = Tournament::create([
        'organizer_id' => $organizer->id, 'sport_id' => $sport->id,
        'name' => 'Understaffed Proceed Cup', 'format' => 'single_elimination', 'starts_at' => now()->subMinute(), 'status' => 'registration',
    ]);
    TournamentRegistration::create(['tournament_id' => $understaffed->id, 'user_id' => userWithRole('player')->id, 'status' => 'pending']);
    app(BracketService::class)->autoStartExpired();
    expect($understaffed->fresh()->status)->toBe('preparation');
    expect($understaffed->fresh()->bracket)->toBeNull();

    $this->actingAs($organizer)->postJson("/api/tournaments/{$understaffed->id}/proceed")->assertStatus(422);
});

it('rejects registering a player for a tournament that has already left draft/registration', function () {
    $coach = userWithRole('coach');
    $organizer = userWithRole('organizer');
    $sport = Sport::create(['name' => 'Chess']);

    $preparation = Tournament::create([
        'organizer_id' => $organizer->id, 'sport_id' => $sport->id,
        'name' => 'Closed Cup', 'format' => 'single_elimination', 'starts_at' => now()->addWeek(), 'status' => 'preparation',
    ]);
    $this->actingAs($coach)->postJson("/api/tournaments/{$preparation->id}/registrations", [
        'user_id' => userWithRole('player')->id,
    ])->assertStatus(422);

    $ongoing = Tournament::create([
        'organizer_id' => $organizer->id, 'sport_id' => $sport->id,
        'name' => 'Ongoing Cup', 'format' => 'single_elimination', 'starts_at' => now()->addWeek(), 'status' => 'ongoing',
    ]);
    $this->actingAs($coach)->postJson("/api/tournaments/{$ongoing->id}/registrations", [
        'user_id' => userWithRole('player')->id,
    ])->assertStatus(422);
});

it('lets the main organizer set a scheduled time and court on a match, rejects it once completed, and denies the venue organizer or a non-owning organizer', function () {
    $organizer = userWithRole('organizer');
    $otherOrganizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $sport = Sport::create(['name' => 'Chess']);
    $venue = Venue::create([
        'facilitator_id' => userWithRole('venue_facilitator')->id,
        'name' => 'Schedule Venue', 'address' => '1 St', 'latitude' => 1, 'longitude' => 1,
    ]);
    $court = Court::create(['venue_id' => $venue->id, 'name' => 'Court 1', 'type' => 'court']);

    $tournament = Tournament::create([
        'organizer_id' => $organizer->id,
        'sport_id' => $sport->id,
        'name' => 'Schedule Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek(),
        'status' => 'registration',
        'venue_organizer_id' => $venueOrganizer->id,
    ]);

    foreach (range(1, 2) as $i) {
        $player = userWithRole('player');
        TournamentRegistration::create(['tournament_id' => $tournament->id, 'user_id' => $player->id, 'status' => 'pending']);
    }

    $this->actingAs($organizer)->postJson("/api/tournaments/{$tournament->id}/generate-bracket")->assertCreated();
    $match = $tournament->fresh()->bracket->matches->first();

    // The venue organizer scores matches — scheduling is the main organizer's job alone.
    $this->actingAs($venueOrganizer)->patchJson("/api/matches/{$match->id}/schedule", [
        'scheduled_at' => now()->addDay()->toIso8601String(), 'court_id' => $court->id,
    ])->assertForbidden();

    // An organizer who doesn't own this tournament is denied too.
    $this->actingAs($otherOrganizer)->patchJson("/api/matches/{$match->id}/schedule", [
        'scheduled_at' => now()->addDay()->toIso8601String(), 'court_id' => $court->id,
    ])->assertForbidden();

    $scheduledAt = now()->addDay();
    $response = $this->actingAs($organizer)->patchJson("/api/matches/{$match->id}/schedule", [
        'scheduled_at' => $scheduledAt->toIso8601String(), 'court_id' => $court->id,
    ])->assertOk();
    expect($response->json('court_id'))->toBe($court->id);

    $this->actingAs($venueOrganizer)->patchJson("/api/matches/{$match->id}/score", [
        'score_a' => 21, 'score_b' => 10, 'status' => 'completed',
    ])->assertOk();

    $this->actingAs($organizer)->patchJson("/api/matches/{$match->id}/schedule", [
        'scheduled_at' => now()->addDays(2)->toIso8601String(),
    ])->assertStatus(422);
});

it('creates an unpublished linked News post when a tournament is created with post_title/post_body, and publishes it once status moves to registration', function () {
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');
    $sport = Sport::create(['name' => 'Chess']);

    $create = $this->actingAs($organizer)->postJson('/api/tournaments', [
        'sport_id' => $sport->id,
        'name' => 'Announced Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek()->toIso8601String(),
        'venue_organizer_id' => $venueOrganizer->id,
        'livestream_organizer_id' => $livestreamOrganizer->id,
        'post_title' => 'Announcing the Cup',
        'post_body' => 'Details about the cup.',
    ])->assertCreated();
    $tournamentId = $create->json('id');

    $news = News::where('tournament_id', $tournamentId)->first();
    expect($news)->not->toBeNull();
    expect($news->title)->toBe('Announcing the Cup');
    expect($news->author_id)->toBe($organizer->id);
    expect($news->published_at)->toBeNull();

    $this->actingAs($organizer)->patchJson("/api/tournaments/{$tournamentId}", ['status' => 'registration'])->assertOk();

    expect($news->fresh()->published_at)->not->toBeNull();
});

it('lets a tournaments organizer create a news post tied to it, and denies a different organizer', function () {
    $owner = userWithRole('organizer');
    $other = userWithRole('organizer');
    $sport = Sport::create(['name' => 'Chess']);

    $tournament = Tournament::create([
        'organizer_id' => $owner->id, 'sport_id' => $sport->id,
        'name' => 'Owned News Cup', 'format' => 'round_robin', 'starts_at' => now()->addWeek(), 'status' => 'registration',
    ]);

    $this->actingAs($owner)->postJson('/api/news', [
        'title' => 'Update', 'body' => 'Body', 'tournament_id' => $tournament->id,
    ])->assertCreated()->assertJsonPath('tournament_id', $tournament->id);

    $this->actingAs($other)->postJson('/api/news', [
        'title' => 'Hijack', 'body' => 'Body', 'tournament_id' => $tournament->id,
    ])->assertForbidden();
});
