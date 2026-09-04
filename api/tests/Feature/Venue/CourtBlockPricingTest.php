<?php

use App\Models\Court;
use App\Models\User;
use App\Models\Venue;

// Mirrors BRCC's real badminton package (₱1,500 for an exact 3-hour block,
// no hourly rate at all) — see VenueSeeder's own seedBrcc() comment.
function makeBlockPricedCourt(User $facilitator, int $blockHours = 3, float $blockPrice = 1500.00): Court
{
    $venue = Venue::create([
        'facilitator_id' => $facilitator->id,
        'name' => 'Block Pricing Test Venue',
        'address' => '1 Test St',
        'latitude' => 1,
        'longitude' => 1,
        'status' => 'active',
    ]);

    return $venue->courts()->create([
        'name' => 'Badminton Courts (Gymnasium)',
        'type' => 'court',
        'capacity' => 24,
        'status' => 'active',
        'block_hours' => $blockHours,
        'block_price' => $blockPrice,
    ]);
}

it('rejects a block-priced court booking whose duration is not an exact multiple of the block length', function () {
    $player = userWithRole('player');
    $facilitator = userWithRole('venue_facilitator');
    $court = makeBlockPricedCourt($facilitator);

    $response = $this->actingAs($player)->postJson('/api/venue-registrations', [
        'venue_id' => $court->venue_id,
        'court_id' => $court->id,
        'starts_at' => now()->addDay()->toIso8601String(),
        'ends_at' => now()->addDay()->addHours(2)->toIso8601String(),
        'purpose' => 'Casual games',
    ]);

    $response->assertStatus(422)->assertJsonValidationErrors('ends_at');
    expect($response->json('message'))->toContain('3-hour blocks');
});

it('accepts a block-priced court booking that is an exact single block, pricing it at the flat block price', function () {
    $player = userWithRole('player');
    $facilitator = userWithRole('venue_facilitator');
    $court = makeBlockPricedCourt($facilitator);

    $response = $this->actingAs($player)->postJson('/api/venue-registrations', [
        'venue_id' => $court->venue_id,
        'court_id' => $court->id,
        'starts_at' => now()->addDay()->toIso8601String(),
        'ends_at' => now()->addDay()->addHours(3)->toIso8601String(),
        'purpose' => 'League practice',
    ])->assertCreated();

    expect((float) $response->json('total_amount'))->toBe(1500.0);
});

it('accepts a block-priced court booking spanning multiple blocks, pricing it proportionally', function () {
    $player = userWithRole('player');
    $facilitator = userWithRole('venue_facilitator');
    $court = makeBlockPricedCourt($facilitator);

    $response = $this->actingAs($player)->postJson('/api/venue-registrations', [
        'venue_id' => $court->venue_id,
        'court_id' => $court->id,
        'starts_at' => now()->addDay()->toIso8601String(),
        'ends_at' => now()->addDay()->addHours(6)->toIso8601String(),
        'purpose' => 'Tournament block',
    ])->assertCreated();

    expect((float) $response->json('total_amount'))->toBe(3000.0);
});

it('does not constrain booking duration on a court with no block pricing configured', function () {
    $player = userWithRole('player');
    $facilitator = userWithRole('venue_facilitator');
    $venue = Venue::create([
        'facilitator_id' => $facilitator->id,
        'name' => 'Ordinary Venue',
        'address' => '1 Test St',
        'latitude' => 1,
        'longitude' => 1,
        'status' => 'active',
        'price_per_hour' => 100,
    ]);
    $court = $venue->courts()->create(['name' => 'Court 1', 'type' => 'court', 'capacity' => 10, 'status' => 'active']);

    $response = $this->actingAs($player)->postJson('/api/venue-registrations', [
        'venue_id' => $venue->id,
        'court_id' => $court->id,
        'starts_at' => now()->addDay()->toIso8601String(),
        'ends_at' => now()->addDay()->addHours(2)->toIso8601String(),
        'purpose' => 'Pickup game',
    ])->assertCreated();

    expect((float) $response->json('total_amount'))->toBe(200.0);
});
