<?php

use App\Models\Court;
use App\Models\User;
use App\Models\Venue;
use App\Models\VenueRegistration;

function makeVenue(User $facilitator): Venue
{
    return Venue::create([
        'facilitator_id' => $facilitator->id,
        'name' => 'Test Venue',
        'address' => '1 Test St',
        'latitude' => 40.0,
        'longitude' => -75.0,
    ]);
}

it('lets anyone read the public venue directory without authentication', function () {
    $facilitator = userWithRole('venue_facilitator');
    makeVenue($facilitator);

    $this->getJson('/api/venues')->assertOk()->assertJsonCount(1);
});

it('denies venue creation to a role without the permission', function () {
    $player = userWithRole('player');

    $this->actingAs($player)->postJson('/api/venues', [
        'name' => 'x', 'address' => 'y', 'latitude' => 1, 'longitude' => 1,
    ])->assertForbidden();
});

it('lets a facilitator create a venue, add a court, and add equipment', function () {
    $facilitator = userWithRole('venue_facilitator');

    $venueResponse = $this->actingAs($facilitator)->postJson('/api/venues', [
        'name' => 'My Gym', 'address' => '1 St', 'latitude' => 1, 'longitude' => 1,
    ])->assertCreated();

    $venueId = $venueResponse->json('id');

    $this->actingAs($facilitator)->postJson("/api/venues/{$venueId}/courts", [
        'name' => 'Court 1', 'type' => 'court',
    ])->assertCreated();

    $this->actingAs($facilitator)->postJson("/api/venues/{$venueId}/equipment", [
        'name' => 'Balls', 'quantity_total' => 5, 'quantity_available' => 5,
    ])->assertCreated();

    $this->assertDatabaseHas('courts', ['venue_id' => $venueId, 'name' => 'Court 1']);
    $this->assertDatabaseHas('equipment', ['venue_id' => $venueId, 'name' => 'Balls']);
});

it('denies a facilitator from modifying another facilitators venue', function () {
    $owner = userWithRole('venue_facilitator');
    $other = userWithRole('venue_facilitator');
    $venue = makeVenue($owner);

    $this->actingAs($other)->patchJson("/api/venues/{$venue->id}", ['name' => 'Hijacked'])
        ->assertForbidden();

    $this->assertDatabaseHas('venues', ['id' => $venue->id, 'name' => 'Test Venue']);
});

it('denies a facilitator from approving another facilitators venue registrations', function () {
    $owner = userWithRole('venue_facilitator');
    $other = userWithRole('venue_facilitator');
    $player = userWithRole('player');
    $venue = makeVenue($owner);

    $registration = VenueRegistration::create([
        'venue_id' => $venue->id,
        'user_id' => $player->id,
        'starts_at' => now()->addDay(),
        'ends_at' => now()->addDay()->addHour(),
        'status' => 'pending',
    ]);

    $this->actingAs($other)->patchJson("/api/venue-registrations/{$registration->id}", ['status' => 'approved'])
        ->assertForbidden();

    $this->actingAs($owner)->patchJson("/api/venue-registrations/{$registration->id}", ['status' => 'approved'])
        ->assertOk()
        ->assertJsonPath('status', 'approved');
});

it('rejects a booking that overlaps an existing pending or approved booking on the same court', function () {
    $facilitator = userWithRole('venue_facilitator');
    $player = userWithRole('player');
    $venue = makeVenue($facilitator);
    $court = Court::create(['venue_id' => $venue->id, 'name' => 'Court 1', 'type' => 'court']);

    VenueRegistration::create([
        'venue_id' => $venue->id,
        'court_id' => $court->id,
        'user_id' => $player->id,
        'starts_at' => now()->addDay(),
        'ends_at' => now()->addDay()->addHour(),
        'status' => 'approved',
    ]);

    $overlapping = $this->actingAs($player)->postJson('/api/venue-registrations', [
        'venue_id' => $venue->id,
        'court_id' => $court->id,
        'starts_at' => now()->addDay()->addMinutes(30)->toIso8601String(),
        'ends_at' => now()->addDay()->addMinutes(90)->toIso8601String(),
    ]);

    $overlapping->assertStatus(422);

    $nonOverlapping = $this->actingAs($player)->postJson('/api/venue-registrations', [
        'venue_id' => $venue->id,
        'court_id' => $court->id,
        'starts_at' => now()->addDays(2)->toIso8601String(),
        'ends_at' => now()->addDays(2)->addHour()->toIso8601String(),
    ]);

    $nonOverlapping->assertCreated();
});
