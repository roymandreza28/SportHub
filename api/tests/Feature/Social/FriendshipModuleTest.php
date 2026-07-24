<?php

use App\Models\Friendship;

it('denies every social route to a role without player or coach', function () {
    $organizer = userWithRole('organizer');

    $this->actingAs($organizer)->getJson('/api/social/friends')->assertForbidden();
});

it('sends a friend request, which the addressee can see as incoming and the requester as outgoing', function () {
    $requester = userWithRole('player');
    $addressee = userWithRole('coach');

    $response = $this->actingAs($requester)->postJson('/api/social/friend-requests', [
        'addressee_id' => $addressee->id,
    ]);

    $response->assertCreated();
    $response->assertJsonPath('status', 'pending');

    $this->actingAs($addressee)->getJson('/api/social/friend-requests?direction=incoming')
        ->assertOk()
        ->assertJsonPath('0.requester.id', $requester->id);

    $this->actingAs($requester)->getJson('/api/social/friend-requests?direction=outgoing')
        ->assertOk()
        ->assertJsonPath('0.addressee.id', $addressee->id);
});

it('rejects a duplicate request in either direction while one is pending', function () {
    $a = userWithRole('player');
    $b = userWithRole('player');

    $this->actingAs($a)->postJson('/api/social/friend-requests', ['addressee_id' => $b->id])->assertCreated();

    $this->actingAs($a)->postJson('/api/social/friend-requests', ['addressee_id' => $b->id])->assertStatus(422);
    $this->actingAs($b)->postJson('/api/social/friend-requests', ['addressee_id' => $a->id])->assertStatus(422);
});

it('rejects friending yourself and friending a non player/coach account', function () {
    $player = userWithRole('player');
    $organizer = userWithRole('organizer');

    $this->actingAs($player)->postJson('/api/social/friend-requests', ['addressee_id' => $player->id])->assertStatus(422);
    $this->actingAs($player)->postJson('/api/social/friend-requests', ['addressee_id' => $organizer->id])->assertStatus(422);
});

it('lets only the addressee accept a pending request, after which both users see each other as friends', function () {
    $requester = userWithRole('player');
    $addressee = userWithRole('coach');

    $friendship = Friendship::create([
        'requester_id' => $requester->id,
        'addressee_id' => $addressee->id,
        'status' => 'pending',
        'pair_key' => Friendship::pairKeyFor($requester->id, $addressee->id),
    ]);

    $this->actingAs($requester)->postJson("/api/social/friend-requests/{$friendship->id}/accept")->assertForbidden();

    $this->actingAs($addressee)->postJson("/api/social/friend-requests/{$friendship->id}/accept")
        ->assertOk()
        ->assertJsonPath('status', 'accepted');

    expect($requester->fresh()->isFriendsWith($addressee))->toBeTrue();
    expect($requester->fresh()->friends()->pluck('id'))->toContain($addressee->id);
    expect($addressee->fresh()->friends()->pluck('id'))->toContain($requester->id);
});

it('lets the requester re-send a request after it was declined', function () {
    $requester = userWithRole('player');
    $addressee = userWithRole('player');

    $friendship = Friendship::create([
        'requester_id' => $requester->id,
        'addressee_id' => $addressee->id,
        'status' => 'pending',
        'pair_key' => Friendship::pairKeyFor($requester->id, $addressee->id),
    ]);

    $this->actingAs($addressee)->postJson("/api/social/friend-requests/{$friendship->id}/decline")->assertNoContent();

    $this->actingAs($requester)->postJson('/api/social/friend-requests', ['addressee_id' => $addressee->id])
        ->assertCreated()
        ->assertJsonPath('status', 'pending')
        ->assertJsonPath('id', $friendship->id);
});

it('lets either party remove a friendship, and denies a non-party from doing so', function () {
    $a = userWithRole('player');
    $b = userWithRole('player');
    $stranger = userWithRole('player');

    $friendship = Friendship::create([
        'requester_id' => $a->id,
        'addressee_id' => $b->id,
        'status' => 'accepted',
        'pair_key' => Friendship::pairKeyFor($a->id, $b->id),
    ]);

    $this->actingAs($stranger)->deleteJson("/api/social/friendships/{$friendship->id}")->assertForbidden();
    $this->actingAs($b)->deleteJson("/api/social/friendships/{$friendship->id}")->assertNoContent();

    expect($a->fresh()->isFriendsWith($b))->toBeFalse();
});
