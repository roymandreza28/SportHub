<?php

use App\Models\Conversation;
use App\Models\User;
use App\Models\Venue;
use App\Models\VenueRegistration;
use App\Services\BookingConversationCleanupService;

function makeBookingVenue(User $facilitator): Venue
{
    return Venue::create([
        'facilitator_id' => $facilitator->id,
        'name' => 'Chat Test Venue',
        'address' => '1 Test St',
        'latitude' => 1,
        'longitude' => 1,
    ]);
}

it('lets a coach book a venue now that the permission has been granted', function () {
    $coach = userWithRole('coach');
    $facilitator = userWithRole('venue_facilitator');
    $venue = makeBookingVenue($facilitator);

    $this->actingAs($coach)->postJson('/api/venue-registrations', [
        'venue_id' => $venue->id,
        'starts_at' => now()->addDay()->toIso8601String(),
        'ends_at' => now()->addDay()->addHour()->toIso8601String(),
        'purpose' => 'Team practice',
    ])->assertCreated();
});

it('rejects a booking request with no purpose', function () {
    $player = userWithRole('player');
    $facilitator = userWithRole('venue_facilitator');
    $venue = makeBookingVenue($facilitator);

    $this->actingAs($player)->postJson('/api/venue-registrations', [
        'venue_id' => $venue->id,
        'starts_at' => now()->addDay()->toIso8601String(),
        'ends_at' => now()->addDay()->addHour()->toIso8601String(),
    ])->assertStatus(422)->assertJsonValidationErrors('purpose');
});

it('creates a conversation the instant a booking is requested, before any facilitator response, and returns the total amount and facilitator contact', function () {
    $player = userWithRole('player');
    $facilitator = userWithRole('venue_facilitator');
    $facilitator->update(['phone' => '0917-123-4567']);
    $venue = makeBookingVenue($facilitator);
    $venue->update(['price_per_hour' => 200]);

    $response = $this->actingAs($player)->postJson('/api/venue-registrations', [
        'venue_id' => $venue->id,
        'starts_at' => now()->addDay()->toIso8601String(),
        'ends_at' => now()->addDay()->addHours(2)->toIso8601String(),
        'purpose' => 'Barangay league practice',
    ])->assertCreated();

    expect($response->json('status'))->toBe('pending');
    expect((float) $response->json('total_amount'))->toBe(400.0);
    expect($response->json('facilitator_name'))->toBe($facilitator->name);
    expect($response->json('facilitator_phone'))->toBe('0917-123-4567');

    $conversationId = $response->json('conversation_id');
    expect($conversationId)->not->toBeNull();

    $conversation = Conversation::findOrFail($conversationId);
    expect($conversation->participants->pluck('id')->sort()->values()->all())
        ->toBe(collect([$player->id, $facilitator->id])->sort()->values()->all());

    // Both parties can already message each other, well before approval.
    $this->actingAs($player)->postJson("/api/social/conversations/{$conversationId}/messages", [
        'body' => 'Requesting this slot, thanks!',
    ])->assertCreated();

    $this->actingAs($facilitator)->postJson("/api/social/conversations/{$conversationId}/messages", [
        'body' => 'Got it, reviewing now.',
    ])->assertCreated();
});

it('reports no total amount when the venue has not published a rate', function () {
    $player = userWithRole('player');
    $facilitator = userWithRole('venue_facilitator');
    $venue = makeBookingVenue($facilitator);

    $response = $this->actingAs($player)->postJson('/api/venue-registrations', [
        'venue_id' => $venue->id,
        'starts_at' => now()->addDay()->toIso8601String(),
        'ends_at' => now()->addDay()->addHour()->toIso8601String(),
        'purpose' => 'Pickup game',
    ])->assertCreated();

    expect($response->json('total_amount'))->toBeNull();
});

it('creates a direct conversation between booker and facilitator once a booking is approved, bypassing the friends-only rule', function () {
    $player = userWithRole('player');
    $facilitator = userWithRole('venue_facilitator');
    $venue = makeBookingVenue($facilitator);

    // Explicitly not friends — this is the whole point of the feature.
    expect($player->friends()->pluck('id'))->not->toContain($facilitator->id);

    $registration = VenueRegistration::create([
        'venue_id' => $venue->id,
        'user_id' => $player->id,
        'starts_at' => now()->addDay(),
        'ends_at' => now()->addDay()->addHour(),
        'status' => 'pending',
    ]);

    $this->actingAs($facilitator)
        ->patchJson("/api/venue-registrations/{$registration->id}", ['status' => 'approved'])
        ->assertOk()
        ->assertJsonPath('conversation.venue_registration_id', $registration->id);

    $conversation = Conversation::where('venue_registration_id', $registration->id)->firstOrFail();
    expect($conversation->participants->pluck('id')->sort()->values()->all())
        ->toBe(collect([$player->id, $facilitator->id])->sort()->values()->all());

    // Both parties can now message in it.
    $this->actingAs($player)->postJson("/api/social/conversations/{$conversation->id}/messages", [
        'body' => 'See you at the court!',
    ])->assertCreated();

    $this->actingAs($facilitator)->postJson("/api/social/conversations/{$conversation->id}/messages", [
        'body' => 'Sounds good.',
    ])->assertCreated();

    $this->actingAs($facilitator)->getJson('/api/social/conversations')->assertOk()->assertJsonCount(1);
});

it('does not create a conversation when a booking is rejected instead of approved', function () {
    $player = userWithRole('player');
    $facilitator = userWithRole('venue_facilitator');
    $venue = makeBookingVenue($facilitator);

    $registration = VenueRegistration::create([
        'venue_id' => $venue->id,
        'user_id' => $player->id,
        'starts_at' => now()->addDay(),
        'ends_at' => now()->addDay()->addHour(),
        'status' => 'pending',
    ]);

    $this->actingAs($facilitator)
        ->patchJson("/api/venue-registrations/{$registration->id}", ['status' => 'rejected'])
        ->assertOk();

    $this->assertDatabaseCount('conversations', 0);
});

it('soft-deletes a booking conversation once its booking day has passed, but keeps a future ones', function () {
    $player = userWithRole('player');
    $facilitator = userWithRole('venue_facilitator');
    $venue = makeBookingVenue($facilitator);

    $pastRegistration = VenueRegistration::create([
        'venue_id' => $venue->id, 'user_id' => $player->id,
        'starts_at' => now()->subDays(2), 'ends_at' => now()->subDays(2)->addHour(),
        'status' => 'approved',
    ]);
    $futureRegistration = VenueRegistration::create([
        'venue_id' => $venue->id, 'user_id' => $player->id,
        'starts_at' => now()->addDay(), 'ends_at' => now()->addDay()->addHour(),
        'status' => 'approved',
    ]);

    $pastConversation = Conversation::create([
        'type' => 'direct', 'created_by' => $facilitator->id, 'venue_registration_id' => $pastRegistration->id,
    ]);
    $pastConversation->participants()->attach([$player->id, $facilitator->id]);

    $futureConversation = Conversation::create([
        'type' => 'direct', 'created_by' => $facilitator->id, 'venue_registration_id' => $futureRegistration->id,
    ]);
    $futureConversation->participants()->attach([$player->id, $facilitator->id]);

    BookingConversationCleanupService::run();

    $this->assertSoftDeleted('conversations', ['id' => $pastConversation->id]);
    $this->assertDatabaseHas('conversations', ['id' => $futureConversation->id, 'deleted_at' => null]);
});

it('cannot view or message a conversation once it has been soft-deleted', function () {
    $player = userWithRole('player');
    $facilitator = userWithRole('venue_facilitator');
    $venue = makeBookingVenue($facilitator);

    $registration = VenueRegistration::create([
        'venue_id' => $venue->id, 'user_id' => $player->id,
        'starts_at' => now()->subDays(2), 'ends_at' => now()->subDays(2)->addHour(),
        'status' => 'approved',
    ]);

    $conversation = Conversation::create([
        'type' => 'direct', 'created_by' => $facilitator->id, 'venue_registration_id' => $registration->id,
    ]);
    $conversation->participants()->attach([$player->id, $facilitator->id]);
    $conversation->delete();

    $this->actingAs($player)->postJson("/api/social/conversations/{$conversation->id}/messages", [
        'body' => 'Still there?',
    ])->assertNotFound();
});
