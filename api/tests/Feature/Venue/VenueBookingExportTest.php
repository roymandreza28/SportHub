<?php

use App\Models\Court;
use App\Models\User;
use App\Models\Venue;
use App\Models\VenueRegistration;

function makeExportVenue(User $facilitator): Venue
{
    return Venue::create([
        'facilitator_id' => $facilitator->id,
        'name' => 'Export Gym',
        'address' => '1 Test St',
        'latitude' => 40.0,
        'longitude' => -75.0,
    ]);
}

it('lets the venue facilitator export bookings as CSV with the real booking data', function () {
    $facilitator = userWithRole('venue_facilitator');
    $venue = makeExportVenue($facilitator);
    $court = Court::create(['venue_id' => $venue->id, 'name' => 'Court 1', 'type' => 'court', 'capacity' => 10, 'status' => 'active']);

    $booker = userWithRole('player');
    $booker->update(['name' => 'Maria Santos', 'email' => 'maria@example.com']);

    VenueRegistration::create([
        'venue_id' => $venue->id,
        'court_id' => $court->id,
        'user_id' => $booker->id,
        'starts_at' => now()->addDay(),
        'ends_at' => now()->addDay()->addHour(),
        'status' => 'approved',
        'purpose' => 'Practice session',
    ]);

    $response = $this->actingAs($facilitator)->get("/api/venues/{$venue->id}/bookings/export");

    $response->assertOk();
    $response->assertHeader('content-type', 'text/csv; charset=UTF-8');

    $csv = $response->streamedContent();
    expect($csv)->toContain('Booking ID');
    expect($csv)->toContain('Booked By');
    expect($csv)->toContain('Court 1');
    expect($csv)->toContain('Maria Santos');
    expect($csv)->toContain('maria@example.com');
    expect($csv)->toContain('Practice session');
    expect($csv)->toContain('approved');
});

it('labels a walk-in booking with no account by its walk-in name', function () {
    $facilitator = userWithRole('venue_facilitator');
    $venue = makeExportVenue($facilitator);
    $court = Court::create(['venue_id' => $venue->id, 'name' => 'Court 1', 'type' => 'court', 'capacity' => 10, 'status' => 'active']);

    VenueRegistration::create([
        'venue_id' => $venue->id,
        'court_id' => $court->id,
        'starts_at' => now()->addDay(),
        'ends_at' => now()->addDay()->addHour(),
        'status' => 'approved',
        'walk_in_name' => 'Walk-in Customer',
    ]);

    $csv = $this->actingAs($facilitator)
        ->get("/api/venues/{$venue->id}/bookings/export")
        ->streamedContent();

    expect($csv)->toContain('Walk-in Customer');
});

it('denies exporting bookings to a facilitator who does not own the venue', function () {
    $owner = userWithRole('venue_facilitator');
    $venue = makeExportVenue($owner);
    $otherFacilitator = userWithRole('venue_facilitator');

    $this->actingAs($otherFacilitator)
        ->get("/api/venues/{$venue->id}/bookings/export")
        ->assertForbidden();
});

it('denies exporting bookings to a non-facilitator role', function () {
    $facilitator = userWithRole('venue_facilitator');
    $venue = makeExportVenue($facilitator);
    $player = userWithRole('player');

    $this->actingAs($player)
        ->get("/api/venues/{$venue->id}/bookings/export")
        ->assertForbidden();
});
