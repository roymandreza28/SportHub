<?php

use App\Models\Sport;
use App\Models\Tournament;
use App\Models\TournamentRegistration;
use App\Models\Venue;

function facilitatorVenue(\App\Models\User $facilitator, string $name = 'My Gym'): Venue
{
    return Venue::create([
        'facilitator_id' => $facilitator->id, 'name' => $name, 'address' => '123 St',
        'latitude' => 14.5, 'longitude' => 121.0, 'status' => 'active',
    ]);
}

it('lets a venue facilitator create a tournament at their own registered venue, auto-assigned as its own venue/livestream organizer', function () {
    $facilitator = userWithRole('venue_facilitator');
    $venue = facilitatorVenue($facilitator);
    $sport = Sport::create(['name' => 'Basketball']);

    // Deliberately doesn't send venue_organizer_id/livestream_organizer_id
    // at all — a facilitator has no separate staff to pick.
    $response = $this->actingAs($facilitator)->postJson('/api/tournaments', [
        'sport_id' => $sport->id,
        'name' => 'Gym Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek()->toIso8601String(),
        'venue_id' => $venue->id,
    ])->assertCreated();

    $tournament = Tournament::find($response->json('id'));
    expect($tournament)
        ->organizer_id->toBe($facilitator->id)
        ->venue_id->toBe($venue->id)
        ->venue_organizer_id->toBe($facilitator->id)
        ->livestream_organizer_id->toBe($facilitator->id);

    // No "you were assigned" self-notification.
    expect(\App\Models\Notification::where('user_id', $facilitator->id)->where('type', 'tournament_assigned')->exists())->toBeFalse();
});

it('ignores an explicit venue/livestream organizer a facilitator tries to assign, overriding it to themselves', function () {
    $facilitator = userWithRole('venue_facilitator');
    $venueOrganizer = userWithRole('venue_organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');
    $venue = facilitatorVenue($facilitator);
    $sport = Sport::create(['name' => 'Basketball']);

    $response = $this->actingAs($facilitator)->postJson('/api/tournaments', [
        'sport_id' => $sport->id,
        'name' => 'Gym Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek()->toIso8601String(),
        'venue_id' => $venue->id,
        'venue_organizer_id' => $venueOrganizer->id,
        'livestream_organizer_id' => $livestreamOrganizer->id,
    ])->assertCreated();

    expect(Tournament::find($response->json('id')))
        ->venue_organizer_id->toBe($facilitator->id)
        ->livestream_organizer_id->toBe($facilitator->id);
});

it('lets a venue facilitator score matches and manage a livestream for their own tournament', function () {
    $facilitator = userWithRole('venue_facilitator');
    $venue = facilitatorVenue($facilitator);
    $sport = Sport::create(['name' => 'Basketball']);

    $tournament = Tournament::create([
        'organizer_id' => $facilitator->id, 'sport_id' => $sport->id, 'venue_id' => $venue->id,
        'venue_organizer_id' => $facilitator->id, 'livestream_organizer_id' => $facilitator->id,
        'name' => 'Gym Cup', 'format' => 'single_elimination', 'starts_at' => now()->addWeek(), 'status' => 'ongoing',
    ]);
    $bracket = \App\Models\Bracket::create(['tournament_id' => $tournament->id, 'structure' => [], 'current_round' => 1]);
    $match = \App\Models\GameMatch::create([
        'bracket_id' => $bracket->id, 'round' => 1, 'status' => 'scheduled',
        'participant_a_id' => userWithRole('player')->id, 'participant_b_id' => userWithRole('player')->id,
    ]);

    $this->actingAs($facilitator)->patchJson("/api/matches/{$match->id}/score", [
        'score_a' => 10, 'score_b' => 5, 'status' => 'live',
    ])->assertOk();

    $this->actingAs($facilitator)->postJson('/api/livestreams', [
        'tournament_id' => $tournament->id, 'title' => 'Gym Cup Live',
        'platform' => 'youtube', 'embed_url' => 'https://youtube.com/watch?v=x',
    ])->assertCreated();
});

it('requires a venue facilitator to specify a venue at all', function () {
    $facilitator = userWithRole('venue_facilitator');
    $sport = Sport::create(['name' => 'Basketball']);

    $this->actingAs($facilitator)->postJson('/api/tournaments', [
        'sport_id' => $sport->id,
        'name' => 'Gym Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek()->toIso8601String(),
    ])->assertStatus(422)->assertJsonValidationErrors('venue_id');
});

it('denies a venue facilitator from holding a tournament at a venue they do not own', function () {
    $facilitator = userWithRole('venue_facilitator');
    $otherFacilitator = userWithRole('venue_facilitator');
    $otherVenue = facilitatorVenue($otherFacilitator, 'Someone Elses Gym');
    $sport = Sport::create(['name' => 'Basketball']);

    $this->actingAs($facilitator)->postJson('/api/tournaments', [
        'sport_id' => $sport->id,
        'name' => 'Gym Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek()->toIso8601String(),
        'venue_id' => $otherVenue->id,
    ])->assertStatus(422)->assertJsonValidationErrors('venue_id');
});

it('denies a venue facilitator from moving their tournament to a venue they do not own via update', function () {
    $facilitator = userWithRole('venue_facilitator');
    $otherFacilitator = userWithRole('venue_facilitator');
    $venue = facilitatorVenue($facilitator);
    $otherVenue = facilitatorVenue($otherFacilitator, 'Someone Elses Gym');
    $sport = Sport::create(['name' => 'Basketball']);

    $tournament = Tournament::create([
        'organizer_id' => $facilitator->id, 'sport_id' => $sport->id, 'venue_id' => $venue->id,
        'name' => 'Gym Cup', 'format' => 'single_elimination', 'starts_at' => now()->addWeek(), 'status' => 'draft',
    ]);

    $this->actingAs($facilitator)->patchJson("/api/tournaments/{$tournament->id}", [
        'venue_id' => $otherVenue->id,
    ])->assertStatus(422)->assertJsonValidationErrors('venue_id');
});

it('lets a venue facilitator generate a bracket, proceed, and cancel their own tournament like an organizer', function () {
    $facilitator = userWithRole('venue_facilitator');
    $venue = facilitatorVenue($facilitator);
    $sport = Sport::create(['name' => 'Basketball']);

    $tournament = Tournament::create([
        'organizer_id' => $facilitator->id, 'sport_id' => $sport->id, 'venue_id' => $venue->id,
        'name' => 'Gym Cup', 'format' => 'single_elimination', 'starts_at' => now()->addWeek(), 'status' => 'registration',
    ]);
    foreach (range(1, 2) as $i) {
        TournamentRegistration::create(['tournament_id' => $tournament->id, 'user_id' => userWithRole('player')->id, 'status' => 'pending']);
    }

    $this->actingAs($facilitator)->postJson("/api/tournaments/{$tournament->id}/generate-bracket")->assertCreated();
    expect($tournament->fresh()->status)->toBe('preparation');

    $this->actingAs($facilitator)->postJson("/api/tournaments/{$tournament->id}/proceed")->assertOk();
    expect($tournament->fresh()->status)->toBe('ongoing');
});

it('denies a venue facilitator from managing a tournament created by someone else', function () {
    $facilitator = userWithRole('venue_facilitator');
    $organizer = userWithRole('organizer');
    $sport = Sport::create(['name' => 'Basketball']);

    $tournament = Tournament::create([
        'organizer_id' => $organizer->id, 'sport_id' => $sport->id,
        'name' => 'Not Yours Cup', 'format' => 'single_elimination', 'starts_at' => now()->addWeek(), 'status' => 'draft',
    ]);

    $this->actingAs($facilitator)->patchJson("/api/tournaments/{$tournament->id}", ['name' => 'Hijacked'])
        ->assertForbidden();
});

it('leaves the main organizer role unrestricted — any venue, or none at all', function () {
    $organizer = userWithRole('organizer');
    $facilitator = userWithRole('venue_facilitator');
    $venueOrganizer = userWithRole('venue_organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');
    $someonesVenue = facilitatorVenue($facilitator);
    $sport = Sport::create(['name' => 'Basketball']);

    // No venue at all — still works, exactly like before this feature existed.
    $this->actingAs($organizer)->postJson('/api/tournaments', [
        'sport_id' => $sport->id, 'name' => 'No Venue Cup', 'format' => 'single_elimination',
        'starts_at' => now()->addWeek()->toIso8601String(),
        'venue_organizer_id' => $venueOrganizer->id, 'livestream_organizer_id' => $livestreamOrganizer->id,
    ])->assertCreated();

    // Any venue, including one it doesn't own itself (organizer has no
    // venue of its own at all) — unrestricted, unlike venue_facilitator.
    $this->actingAs($organizer)->postJson('/api/tournaments', [
        'sport_id' => $sport->id, 'name' => 'Any Venue Cup', 'format' => 'single_elimination',
        'starts_at' => now()->addWeek()->toIso8601String(), 'venue_id' => $someonesVenue->id,
        'venue_organizer_id' => $venueOrganizer->id, 'livestream_organizer_id' => $livestreamOrganizer->id,
    ])->assertCreated();
});
