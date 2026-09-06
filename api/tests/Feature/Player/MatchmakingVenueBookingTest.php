<?php

use App\Models\Sport;
use App\Models\SportFormat;
use App\Models\Venue;
use App\Models\VenueRegistration;

// Mirrors BRCC's real badminton package (₱1,500 for an exact 3-hour block,
// no hourly rate at all) — see CourtBlockPricingTest.php's own helper.
function makeVenueWithBlockPricedCourt(string $sportName = 'Badminton', int $blockHours = 3, float $blockPrice = 1500.00): array
{
    $facilitator = userWithRole('venue_facilitator');
    $venue = Venue::create([
        'facilitator_id' => $facilitator->id,
        'name' => 'BRCC-style Test Venue',
        'address' => '1 Test St',
        'latitude' => 1,
        'longitude' => 1,
        'status' => 'active',
    ]);
    $sport = Sport::create(['name' => $sportName]);
    $court = $venue->courts()->create([
        'name' => 'Badminton Courts (Gymnasium)',
        'type' => 'court',
        'capacity' => 24,
        'status' => 'active',
        'block_hours' => $blockHours,
        'block_price' => $blockPrice,
    ]);
    $court->sports()->attach($sport->id);

    return [$venue, $sport, $court];
}

function makeBookableVenue(): Venue
{
    $facilitator = userWithRole('venue_facilitator');

    return Venue::create([
        'facilitator_id' => $facilitator->id,
        'name' => 'Matchmaking Test Venue',
        'address' => '1 Test St',
        'latitude' => 1,
        'longitude' => 1,
        'status' => 'active',
    ]);
}

it('requires both a start and end time whenever a venue is named', function () {
    $player = userWithRole('player');
    $sport = Sport::create(['name' => 'Basketball']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => 'Pickup', 'players_per_side' => 1]);
    $venue = makeBookableVenue();

    $this->actingAs($player)->postJson('/api/matchmaking-requests', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'venue_id' => $venue->id,
    ])->assertStatus(422)->assertJsonValidationErrors('preferred_start_at');
});

it('rejects a preferred start time less than 3 hours away', function () {
    $player = userWithRole('player');
    $sport = Sport::create(['name' => 'Basketball']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => 'Pickup', 'players_per_side' => 1]);
    $venue = makeBookableVenue();

    $this->actingAs($player)->postJson('/api/matchmaking-requests', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'venue_id' => $venue->id,
        'preferred_start_at' => now()->addHours(2)->toIso8601String(),
        'preferred_end_at' => now()->addHours(3)->toIso8601String(),
    ])->assertStatus(422)->assertJsonValidationErrors('preferred_start_at');
});

it('auto-reserves the pair\'s venue+time the instant they match, and opens a facilitator conversation immediately', function () {
    $venue = makeBookableVenue();
    $playerA = userWithRole('player');
    $playerB = userWithRole('player');
    $sport = Sport::create(['name' => 'Basketball']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => 'Pickup', 'players_per_side' => 1]);

    $starts = now()->addHours(5);
    $ends = now()->addHours(6);

    // Player A creates with a venue+time preference; Player B just joins.
    $this->actingAs($playerA)->postJson('/api/matchmaking-requests', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'venue_id' => $venue->id,
        'preferred_start_at' => $starts->toIso8601String(),
        'preferred_end_at' => $ends->toIso8601String(),
    ])->assertCreated()->assertJsonPath('status', 'open');

    $this->actingAs($playerB)->postJson('/api/matchmaking-requests', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
    ])->assertCreated()->assertJsonPath('status', 'matched');

    $registration = VenueRegistration::where('venue_id', $venue->id)->first();
    expect($registration)->not->toBeNull();
    expect($registration->status)->toBe('pending');
    expect($registration->user_id)->toBe($playerA->id);

    // Both matched players' own view of their request carries the same
    // reservation + conversation — powers the frontend down-payment prompt
    // for whichever side is looking at it.
    $mineA = $this->actingAs($playerA)->getJson('/api/matchmaking-requests/mine')->assertOk();
    expect($mineA->json('0.venue_registration.id'))->toBe($registration->id);
    expect($mineA->json('0.venue_registration.status'))->toBe('pending');
    $conversationId = $mineA->json('0.venue_registration.conversation_id');
    expect($conversationId)->not->toBeNull();

    $mineB = $this->actingAs($playerB)->getJson('/api/matchmaking-requests/mine')->assertOk();
    expect($mineB->json('0.venue_registration.id'))->toBe($registration->id);

    // The conversation exists *before* facilitator approval — participants
    // are the booker and the facilitator (not the opponent, who never
    // booked anything).
    $facilitatorId = $venue->facilitator_id;
    $messages = $this->actingAs($playerA)->postJson("/api/social/conversations/{$conversationId}/messages", [
        'body' => 'Sending my GCash payment now',
    ]);
    $messages->assertCreated();

    $this->actingAs(\App\Models\User::find($facilitatorId))
        ->getJson("/api/social/conversations/{$conversationId}/messages")
        ->assertOk()
        ->assertJsonPath('data.0.body', 'Sending my GCash payment now');

    $this->actingAs($playerB)
        ->getJson("/api/social/conversations/{$conversationId}/messages")
        ->assertForbidden();
});

it('prices a matchmaking auto-reservation at a block-priced court\'s package rate, not an hourly rate', function () {
    [$venue, $sport, $court] = makeVenueWithBlockPricedCourt();
    $playerA = userWithRole('player');
    $playerB = userWithRole('player');
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => 'Singles', 'players_per_side' => 1]);

    $starts = now()->addHours(5);
    $ends = now()->addHours(8); // exactly one 3-hour block

    $this->actingAs($playerA)->postJson('/api/matchmaking-requests', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'venue_id' => $venue->id,
        'preferred_start_at' => $starts->toIso8601String(),
        'preferred_end_at' => $ends->toIso8601String(),
    ])->assertCreated();
    $this->actingAs($playerB)->postJson('/api/matchmaking-requests', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
    ])->assertCreated()->assertJsonPath('status', 'matched');

    $registration = VenueRegistration::where('venue_id', $venue->id)->firstOrFail();
    expect($registration->court_id)->toBe($court->id);

    $mineA = $this->actingAs($playerA)->getJson('/api/matchmaking-requests/mine')->assertOk();
    expect((float) $mineA->json('0.venue_registration.total_amount'))->toBe(1500.0);
    expect($mineA->json('0.venue_registration.court.id'))->toBe($court->id);
});

it('does not auto-reserve a block-priced court when the requested duration is not a block multiple', function () {
    [$venue, $sport] = makeVenueWithBlockPricedCourt();
    $playerA = userWithRole('player');
    $playerB = userWithRole('player');
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => 'Singles', 'players_per_side' => 1]);

    $starts = now()->addHours(5);
    $ends = now()->addHours(7); // 2 hours — not a multiple of the 3-hour block

    $this->actingAs($playerA)->postJson('/api/matchmaking-requests', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'venue_id' => $venue->id,
        'preferred_start_at' => $starts->toIso8601String(),
        'preferred_end_at' => $ends->toIso8601String(),
    ])->assertCreated();
    $this->actingAs($playerB)->postJson('/api/matchmaking-requests', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
    ])->assertCreated()->assertJsonPath('status', 'matched');

    // The pair still matched, just without an auto-booked slot — same
    // soft-fail convention as an overlap or closed venue.
    expect(VenueRegistration::where('venue_id', $venue->id)->count())->toBe(0);
    $mineA = $this->actingAs($playerA)->getJson('/api/matchmaking-requests/mine')->assertOk();
    expect($mineA->json('0.venue_registration'))->toBeNull();
});

it('still pairs the players even if the requested slot is no longer available, just without an auto-reservation', function () {
    $venue = makeBookableVenue();
    $playerA = userWithRole('player');
    $playerB = userWithRole('player');
    $blocker = userWithRole('player');
    $sport = Sport::create(['name' => 'Basketball']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => 'Pickup', 'players_per_side' => 1]);

    $starts = now()->addHours(5);
    $ends = now()->addHours(6);

    // Someone else already holds that exact slot at the same venue.
    VenueRegistration::create([
        'venue_id' => $venue->id, 'user_id' => $blocker->id,
        'starts_at' => $starts, 'ends_at' => $ends, 'status' => 'approved',
    ]);

    $this->actingAs($playerA)->postJson('/api/matchmaking-requests', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'venue_id' => $venue->id,
        'preferred_start_at' => $starts->toIso8601String(),
        'preferred_end_at' => $ends->toIso8601String(),
    ])->assertCreated();

    $response = $this->actingAs($playerB)->postJson('/api/matchmaking-requests', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
    ]);
    $response->assertCreated()->assertJsonPath('status', 'matched');

    $mineA = $this->actingAs($playerA)->getJson('/api/matchmaking-requests/mine')->assertOk();
    expect($mineA->json('0.venue_registration'))->toBeNull();
    // Only the pre-existing blocker's registration exists — nothing new
    // was created for the matched pair.
    expect(VenueRegistration::where('venue_id', $venue->id)->count())->toBe(1);
});

it('lets the facilitator approve the auto-reserved slot, recording it in both the players and the facilitators booking lists', function () {
    $venue = makeBookableVenue();
    $facilitator = \App\Models\User::find($venue->facilitator_id);
    $playerA = userWithRole('player');
    $playerB = userWithRole('player');
    $sport = Sport::create(['name' => 'Basketball']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => 'Pickup', 'players_per_side' => 1]);

    $starts = now()->addHours(5);
    $ends = now()->addHours(6);

    $this->actingAs($playerA)->postJson('/api/matchmaking-requests', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'venue_id' => $venue->id,
        'preferred_start_at' => $starts->toIso8601String(),
        'preferred_end_at' => $ends->toIso8601String(),
    ])->assertCreated();
    $this->actingAs($playerB)->postJson('/api/matchmaking-requests', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
    ])->assertCreated();

    $registration = VenueRegistration::where('venue_id', $venue->id)->firstOrFail();

    $this->actingAs($facilitator)
        ->patchJson("/api/venue-registrations/{$registration->id}", ['status' => 'approved'])
        ->assertOk();

    expect($registration->fresh()->status)->toBe('approved');

    // Recorded in the player's own booking history...
    $this->actingAs($playerA)->getJson('/api/venue-registrations/mine')
        ->assertOk()
        ->assertJsonPath('0.id', $registration->id)
        ->assertJsonPath('0.status', 'approved');

    // ...and in the facilitator's venue-level view.
    $this->actingAs($facilitator)->getJson('/api/venues/mine')
        ->assertOk()
        ->assertJsonPath('0.venue_registrations_count', 1);
});
