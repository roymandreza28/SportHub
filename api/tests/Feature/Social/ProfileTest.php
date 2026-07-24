<?php

use App\Models\Friendship;

it('reports friendship_status as self, none, pending_sent, pending_received, and friends', function () {
    $me = userWithRole('player');
    $stranger = userWithRole('player');
    $sentTo = userWithRole('player');
    $receivedFrom = userWithRole('player');
    $friend = userWithRole('coach');

    Friendship::create([
        'requester_id' => $me->id, 'addressee_id' => $sentTo->id, 'status' => 'pending',
        'pair_key' => Friendship::pairKeyFor($me->id, $sentTo->id),
    ]);
    Friendship::create([
        'requester_id' => $receivedFrom->id, 'addressee_id' => $me->id, 'status' => 'pending',
        'pair_key' => Friendship::pairKeyFor($me->id, $receivedFrom->id),
    ]);
    Friendship::create([
        'requester_id' => $me->id, 'addressee_id' => $friend->id, 'status' => 'accepted',
        'pair_key' => Friendship::pairKeyFor($me->id, $friend->id),
    ]);

    $this->actingAs($me)->getJson("/api/social/users/{$me->id}")->assertJsonPath('friendship_status', 'self');
    $this->actingAs($me)->getJson("/api/social/users/{$stranger->id}")->assertJsonPath('friendship_status', 'none');
    $this->actingAs($me)->getJson("/api/social/users/{$sentTo->id}")->assertJsonPath('friendship_status', 'pending_sent');
    $this->actingAs($me)->getJson("/api/social/users/{$receivedFrom->id}")->assertJsonPath('friendship_status', 'pending_received');
    $this->actingAs($me)->getJson("/api/social/users/{$friend->id}")->assertJsonPath('friendship_status', 'friends');
});

it('404s when viewing a profile for a role outside the social layer', function () {
    $me = userWithRole('player');
    $organizer = userWithRole('organizer');

    $this->actingAs($me)->getJson("/api/social/users/{$organizer->id}")->assertNotFound();
});
