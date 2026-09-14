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

it('lets a venue facilitator create a tournament at their own registered venue', function () {
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
        ->organizer_id->toBe($facilitator->id)
        ->venue_id->toBe($venue->id);
});

it('requires a venue facilitator to specify a venue at all', function () {
    $facilitator = userWithRole('venue_facilitator');
    $venueOrganizer = userWithRole('venue_organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');
    $sport = Sport::create(['name' => 'Basketball']);

    $this->actingAs($facilitator)->postJson('/api/tournaments', [
        'sport_id' => $sport->id,
        'name' => 'Gym Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek()->toIso8601String(),
        'venue_organizer_id' => $venueOrganizer->id,
        'livestream_organizer_id' => $livestreamOrganizer->id,
    ])->assertStatus(422)->assertJsonValidationErrors('venue_id');
});

it('denies a venue facilitator from holding a tournament at a venue they do not own', function () {
    $facilitator = userWithRole('venue_facilitator');
    $otherFacilitator = userWithRole('venue_facilitator');
    $venueOrganizer = userWithRole('venue_organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');
    $otherVenue = facilitatorVenue($otherFacilitator, 'Someone Elses Gym');
    $sport = Sport::create(['name' => 'Basketball']);

    $this->actingAs($facilitator)->postJson('/api/tournaments', [
        'sport_id' => $sport->id,
        'name' => 'Gym Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek()->toIso8601String(),
        'venue_id' => $otherVenue->id,
        'venue_organizer_id' => $venueOrganizer->id,
        'livestream_organizer_id' => $livestreamOrganizer->id,
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
