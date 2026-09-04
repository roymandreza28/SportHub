<?php

use App\Models\Court;
use App\Models\Sport;
use App\Models\User;
use App\Models\Venue;
use App\Models\VenueRegistration;
use Carbon\Carbon;

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

it('creates each named court with its own sport(s) at venue-creation time', function () {
    $facilitator = userWithRole('venue_facilitator');
    $basketball = Sport::create(['name' => 'Basketball']);
    $badminton = Sport::create(['name' => 'Badminton']);

    $response = $this->actingAs($facilitator)->postJson('/api/venues', [
        'name' => 'Multi-Sport Hall', 'address' => '1 St', 'latitude' => 1, 'longitude' => 1,
        'courts' => [
            ['name' => 'Basketball Court 1', 'sport_ids' => [$basketball->id]],
            ['name' => 'Basketball Court 2', 'sport_ids' => [$basketball->id]],
            ['name' => 'Badminton Court', 'sport_ids' => [$badminton->id]],
        ],
    ])->assertCreated();

    expect($response->json('courts'))->toHaveCount(3);
    $venueId = $response->json('id');
    $this->assertDatabaseCount('courts', 3);
    $this->assertDatabaseHas('courts', ['venue_id' => $venueId, 'name' => 'Basketball Court 1']);
    $this->assertDatabaseHas('courts', ['venue_id' => $venueId, 'name' => 'Basketball Court 2']);
    $this->assertDatabaseHas('courts', ['venue_id' => $venueId, 'name' => 'Badminton Court']);

    $badmintonCourtId = Court::where('venue_id', $venueId)->where('name', 'Badminton Court')->value('id');
    $this->assertDatabaseHas('court_sport', ['court_id' => $badmintonCourtId, 'sport_id' => $badminton->id]);
});

it('auto-names courts whose name is omitted entirely, not just left blank', function () {
    // The "add multiple courts that share sports" quick-add flow never
    // sends a name key at all (as opposed to sending an empty string) —
    // this must not crash on the missing array key.
    $facilitator = userWithRole('venue_facilitator');
    $tennis = Sport::create(['name' => 'Tennis']);

    $response = $this->actingAs($facilitator)->postJson('/api/venues', [
        'name' => 'Quick Add Park', 'address' => '1 St', 'latitude' => 1, 'longitude' => 1,
        'courts' => [
            ['sport_ids' => [$tennis->id]],
            ['sport_ids' => [$tennis->id]],
        ],
    ])->assertCreated();

    $venueId = $response->json('id');
    $this->assertDatabaseHas('courts', ['venue_id' => $venueId, 'name' => 'Court 1']);
    $this->assertDatabaseHas('courts', ['venue_id' => $venueId, 'name' => 'Court 2']);
});

it('creates a single court that shares more than one sport, discoverable by any of them', function () {
    $facilitator = userWithRole('venue_facilitator');
    $tennis = Sport::create(['name' => 'Tennis']);
    $pickleball = Sport::create(['name' => 'Pickleball']);

    $response = $this->actingAs($facilitator)->postJson('/api/venues', [
        'name' => 'Shared Court Park', 'address' => '1 St', 'latitude' => 1, 'longitude' => 1,
        'courts' => [
            ['name' => 'Court A', 'sport_ids' => [$tennis->id, $pickleball->id]],
        ],
    ])->assertCreated();

    expect($response->json('courts'))->toHaveCount(1);
    expect($response->json('courts.0.sports'))->toHaveCount(2);

    $venueId = $response->json('id');
    $this->getJson("/api/venues?sport_id={$tennis->id}")->assertOk()->assertJsonPath('0.id', $venueId);
    $this->getJson("/api/venues?sport_id={$pickleball->id}")->assertOk()->assertJsonPath('0.id', $venueId);
});

it('lets a facilitator add a court with multiple sports after venue creation, and change its sports later', function () {
    $facilitator = userWithRole('venue_facilitator');
    $venue = makeVenue($facilitator);
    $tennis = Sport::create(['name' => 'Tennis']);
    $pickleball = Sport::create(['name' => 'Pickleball']);

    $court = $this->actingAs($facilitator)->postJson("/api/venues/{$venue->id}/courts", [
        'name' => 'Court A', 'type' => 'court', 'sport_ids' => [$tennis->id, $pickleball->id],
    ])->assertCreated();

    expect($court->json('sports'))->toHaveCount(2);

    $this->actingAs($facilitator)->patchJson("/api/courts/{$court->json('id')}", [
        'sport_ids' => [$tennis->id],
    ])->assertOk()->assertJsonPath('sports.0.id', $tennis->id);

    $this->assertDatabaseCount('court_sport', 1);
});

it('creates equipment supplied at venue-creation time', function () {
    $facilitator = userWithRole('venue_facilitator');

    $response = $this->actingAs($facilitator)->postJson('/api/venues', [
        'name' => 'Equipped Hall', 'address' => '1 St', 'latitude' => 1, 'longitude' => 1,
        'equipment' => [
            ['name' => 'Basketballs', 'quantity' => 10],
            ['name' => 'Cones', 'quantity' => 20],
        ],
    ])->assertCreated();

    $venueId = $response->json('id');
    expect($response->json('equipment'))->toHaveCount(2);
    $this->assertDatabaseHas('equipment', ['venue_id' => $venueId, 'name' => 'Basketballs', 'quantity_total' => 10, 'quantity_available' => 10]);
    $this->assertDatabaseHas('equipment', ['venue_id' => $venueId, 'name' => 'Cones', 'quantity_total' => 20, 'quantity_available' => 20]);
});

it('lists every one of the facilitators own venues regardless of status, unlike the public directory', function () {
    $facilitator = userWithRole('venue_facilitator');
    $active = makeVenue($facilitator);
    $inactive = Venue::create([
        'facilitator_id' => $facilitator->id, 'name' => 'Closed Venue', 'address' => '2 St',
        'latitude' => 1, 'longitude' => 1, 'status' => 'inactive',
    ]);

    $this->getJson('/api/venues')->assertOk()->assertJsonCount(1);

    $mine = $this->actingAs($facilitator)->getJson('/api/venues/mine')->assertOk();
    expect($mine->json())->toHaveCount(2);
    expect(collect($mine->json())->pluck('id'))->toContain($active->id, $inactive->id);
});

it('lets a facilitator deactivate their own venue, hiding it from the public directory', function () {
    $facilitator = userWithRole('venue_facilitator');
    $venue = makeVenue($facilitator);

    $this->actingAs($facilitator)->patchJson("/api/venues/{$venue->id}", ['status' => 'inactive'])
        ->assertOk()
        ->assertJsonPath('status', 'inactive');

    $this->getJson('/api/venues')->assertOk()->assertJsonCount(0);
});

it('rejects a booking for an inactive venue', function () {
    $facilitator = userWithRole('venue_facilitator');
    $player = userWithRole('player');
    $venue = Venue::create([
        'facilitator_id' => $facilitator->id, 'name' => 'Closed Venue', 'address' => '1 St',
        'latitude' => 1, 'longitude' => 1, 'status' => 'inactive',
    ]);

    $this->actingAs($player)->postJson('/api/venue-registrations', [
        'venue_id' => $venue->id,
        'starts_at' => now()->addDay()->toIso8601String(),
        'ends_at' => now()->addDay()->addHour()->toIso8601String(),
    ])->assertStatus(422);
});

it('persists operating hours set at venue creation and rejects closes_at before opens_at', function () {
    $facilitator = userWithRole('venue_facilitator');

    $this->actingAs($facilitator)->postJson('/api/venues', [
        'name' => 'Hours Test', 'address' => '1 St', 'latitude' => 1, 'longitude' => 1,
        'opens_at' => '09:00', 'closes_at' => '17:00',
    ])->assertCreated()
        ->assertJsonPath('opens_at', '09:00:00')
        ->assertJsonPath('closes_at', '17:00:00');

    $this->actingAs($facilitator)->postJson('/api/venues', [
        'name' => 'Bad Hours', 'address' => '1 St', 'latitude' => 1, 'longitude' => 1,
        'opens_at' => '17:00', 'closes_at' => '09:00',
    ])->assertStatus(422);
});

it('rejects a booking outside the venues operating hours and accepts one inside them', function () {
    $facilitator = userWithRole('venue_facilitator');
    $player = userWithRole('player');
    $venue = Venue::create([
        'facilitator_id' => $facilitator->id,
        'name' => 'Hours Venue', 'address' => '1 St', 'latitude' => 1, 'longitude' => 1,
        'opens_at' => '09:00', 'closes_at' => '17:00',
    ]);

    $tooEarly = $this->actingAs($player)->postJson('/api/venue-registrations', [
        'venue_id' => $venue->id,
        'starts_at' => Carbon::parse('tomorrow 07:00', 'Asia/Manila')->toIso8601String(),
        'ends_at' => Carbon::parse('tomorrow 08:00', 'Asia/Manila')->toIso8601String(),
    ]);
    $tooEarly->assertStatus(422);

    $withinHours = $this->actingAs($player)->postJson('/api/venue-registrations', [
        'venue_id' => $venue->id,
        'starts_at' => Carbon::parse('tomorrow 10:00', 'Asia/Manila')->toIso8601String(),
        'ends_at' => Carbon::parse('tomorrow 11:00', 'Asia/Manila')->toIso8601String(),
        'purpose' => 'Practice session',
    ]);
    $withinHours->assertCreated();
});

it('soft-deletes a venue, removing it from both the public directory and the facilitators own list', function () {
    $facilitator = userWithRole('venue_facilitator');
    $venue = makeVenue($facilitator);

    $this->actingAs($facilitator)->deleteJson("/api/venues/{$venue->id}")->assertNoContent();

    $this->assertSoftDeleted('venues', ['id' => $venue->id]);
    $this->getJson('/api/venues')->assertOk()->assertJsonCount(0);
    $this->actingAs($facilitator)->getJson('/api/venues/mine')->assertOk()->assertJsonCount(0);
});

it('denies a facilitator from deleting another facilitators venue', function () {
    $owner = userWithRole('venue_facilitator');
    $other = userWithRole('venue_facilitator');
    $venue = makeVenue($owner);

    $this->actingAs($other)->deleteJson("/api/venues/{$venue->id}")->assertForbidden();
    $this->assertDatabaseHas('venues', ['id' => $venue->id, 'deleted_at' => null]);
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

it('still shows the venue name on a players own booking history after that venue is soft-deleted', function () {
    $facilitator = userWithRole('venue_facilitator');
    $player = userWithRole('player');
    $venue = makeVenue($facilitator);

    VenueRegistration::create([
        'venue_id' => $venue->id,
        'user_id' => $player->id,
        'starts_at' => now()->addDay(),
        'ends_at' => now()->addDay()->addHour(),
        'status' => 'pending',
    ]);

    $venue->delete();
    $this->assertSoftDeleted('venues', ['id' => $venue->id]);

    $this->actingAs($player)->getJson('/api/venue-registrations/mine')
        ->assertOk()
        ->assertJsonPath('0.venue.name', 'Test Venue');
});

it('reports total and pending booking counts per venue on the facilitators own listing', function () {
    $facilitator = userWithRole('venue_facilitator');
    $player = userWithRole('player');
    $venue = makeVenue($facilitator);

    VenueRegistration::create([
        'venue_id' => $venue->id, 'user_id' => $player->id,
        'starts_at' => now()->addDay(), 'ends_at' => now()->addDay()->addHour(), 'status' => 'pending',
    ]);
    VenueRegistration::create([
        'venue_id' => $venue->id, 'user_id' => $player->id,
        'starts_at' => now()->addDays(2), 'ends_at' => now()->addDays(2)->addHour(), 'status' => 'pending',
    ]);
    VenueRegistration::create([
        'venue_id' => $venue->id, 'user_id' => $player->id,
        'starts_at' => now()->addDays(3), 'ends_at' => now()->addDays(3)->addHour(), 'status' => 'approved',
    ]);

    $this->actingAs($facilitator)->getJson('/api/venues/mine')
        ->assertOk()
        ->assertJsonPath('0.venue_registrations_count', 3)
        ->assertJsonPath('0.pending_bookings_count', 2);
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
        'purpose' => 'Practice session',
    ]);

    $nonOverlapping->assertCreated();
});

it('rejects a venue-wide booking that overlaps an existing court booking, and vice versa', function () {
    $facilitator = userWithRole('venue_facilitator');
    $player = userWithRole('player');
    $venue = makeVenue($facilitator);
    $court = Court::create(['venue_id' => $venue->id, 'name' => 'Court 1', 'type' => 'court']);

    // An existing court-specific booking blocks a new venue-wide booking
    // that overlaps its time range.
    VenueRegistration::create([
        'venue_id' => $venue->id,
        'court_id' => $court->id,
        'user_id' => $player->id,
        'starts_at' => now()->addDay(),
        'ends_at' => now()->addDay()->addHour(),
        'status' => 'approved',
    ]);

    $this->actingAs($player)->postJson('/api/venue-registrations', [
        'venue_id' => $venue->id,
        'starts_at' => now()->addDay()->addMinutes(30)->toIso8601String(),
        'ends_at' => now()->addDay()->addMinutes(90)->toIso8601String(),
    ])->assertStatus(422);

    // A venue-wide booking blocks every court, including a new booking on
    // a *different* court in the same venue for an overlapping time.
    $otherCourt = Court::create(['venue_id' => $venue->id, 'name' => 'Court 2', 'type' => 'court']);
    VenueRegistration::create([
        'venue_id' => $venue->id,
        'court_id' => null,
        'user_id' => $player->id,
        'starts_at' => now()->addDays(2),
        'ends_at' => now()->addDays(2)->addHour(),
        'status' => 'approved',
    ]);

    $this->actingAs($player)->postJson('/api/venue-registrations', [
        'venue_id' => $venue->id,
        'court_id' => $otherCourt->id,
        'starts_at' => now()->addDays(2)->addMinutes(30)->toIso8601String(),
        'ends_at' => now()->addDays(2)->addMinutes(90)->toIso8601String(),
    ])->assertStatus(422);
});

it('persists price_per_hour when a facilitator creates or updates a venue', function () {
    $facilitator = userWithRole('venue_facilitator');

    $created = $this->actingAs($facilitator)->postJson('/api/venues', [
        'name' => 'Priced Gym', 'address' => '1 St', 'latitude' => 1, 'longitude' => 1,
        'price_per_hour' => 250.50,
    ])->assertCreated();

    expect((float) $created->json('price_per_hour'))->toBe(250.50);

    $venueId = $created->json('id');

    $updated = $this->actingAs($facilitator)->patchJson("/api/venues/{$venueId}", [
        'price_per_hour' => 300,
    ])->assertOk();

    expect((float) $updated->json('price_per_hour'))->toBe(300.0);
});

it('lets a facilitator manually add an already-approved walk-in booking, blocking that slot for the app too', function () {
    $facilitator = userWithRole('venue_facilitator');
    $player = userWithRole('player');
    $venue = makeVenue($facilitator);
    $court = Court::create(['venue_id' => $venue->id, 'name' => 'Court 1', 'type' => 'court']);

    $manual = $this->actingAs($facilitator)->postJson("/api/venues/{$venue->id}/registrations/manual", [
        'court_id' => $court->id,
        'starts_at' => now()->addHour()->toIso8601String(),
        'ends_at' => now()->addHours(2)->toIso8601String(),
        'walk_in_name' => 'Juan Dela Cruz',
        'walk_in_contact' => '0917-000-0000',
    ])->assertCreated();

    expect($manual->json('status'))->toBe('approved');
    $this->assertDatabaseHas('venue_registrations', [
        'venue_id' => $venue->id,
        'court_id' => $court->id,
        'walk_in_name' => 'Juan Dela Cruz',
        'status' => 'approved',
        'user_id' => null,
    ]);

    // A player trying to book the same court/time is rejected.
    $this->actingAs($player)->postJson('/api/venue-registrations', [
        'venue_id' => $venue->id,
        'court_id' => $court->id,
        'starts_at' => now()->addHour()->addMinutes(15)->toIso8601String(),
        'ends_at' => now()->addHour()->addMinutes(45)->toIso8601String(),
    ])->assertStatus(422);
});

it('rejects a walk-in booking that overlaps an existing in-app booking', function () {
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

    $this->actingAs($facilitator)->postJson("/api/venues/{$venue->id}/registrations/manual", [
        'court_id' => $court->id,
        'starts_at' => now()->addDay()->addMinutes(30)->toIso8601String(),
        'ends_at' => now()->addDay()->addMinutes(90)->toIso8601String(),
        'walk_in_name' => 'Maria Santos',
    ])->assertStatus(422);
});

it('denies a facilitator from manually booking a venue they do not own', function () {
    $facilitator = userWithRole('venue_facilitator');
    $otherFacilitator = userWithRole('venue_facilitator');
    $venue = makeVenue($facilitator);

    $this->actingAs($otherFacilitator)->postJson("/api/venues/{$venue->id}/registrations/manual", [
        'starts_at' => now()->addHour()->toIso8601String(),
        'ends_at' => now()->addHours(2)->toIso8601String(),
        'walk_in_name' => 'Someone',
    ])->assertForbidden();
});

it('rejects a manual booking outside the venues operating hours', function () {
    $facilitator = userWithRole('venue_facilitator');
    $venue = makeVenue($facilitator);
    $venue->update(['opens_at' => '08:00:00', 'closes_at' => '20:00:00']);

    $this->actingAs($facilitator)->postJson("/api/venues/{$venue->id}/registrations/manual", [
        'starts_at' => Carbon::parse('tomorrow 21:00', 'Asia/Manila')->toIso8601String(),
        'ends_at' => Carbon::parse('tomorrow 22:00', 'Asia/Manila')->toIso8601String(),
        'walk_in_name' => 'Late Walk-in',
    ])->assertStatus(422);
});
