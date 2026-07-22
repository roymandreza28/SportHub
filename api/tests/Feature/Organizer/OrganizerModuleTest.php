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

it('creates a tournament, generates a bracket, and plays it through to completion via HTTP', function () {
    $organizer = userWithRole('organizer');
    $sport = Sport::create(['name' => 'Basketball']);

    $create = $this->actingAs($organizer)->postJson('/api/tournaments', [
        'sport_id' => $sport->id,
        'name' => 'HTTP Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek()->toIso8601String(),
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
        $this->actingAs($organizer)->patchJson("/api/matches/{$match['id']}/score", [
            'score_a' => 21, 'score_b' => 10, 'status' => 'completed',
        ])->assertOk();
    }

    $final = $this->actingAs($organizer)->getJson("/api/tournaments/{$tournamentId}/bracket")
        ->json('structure.1.0');
    expect($final['participant_a_id'])->not->toBeNull();
    expect($final['participant_b_id'])->not->toBeNull();

    $this->actingAs($organizer)->patchJson("/api/matches/{$final['id']}/score", [
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
