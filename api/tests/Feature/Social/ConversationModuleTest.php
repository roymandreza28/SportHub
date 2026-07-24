<?php

use App\Models\Friendship;

function makeFriends($a, $b)
{
    Friendship::create([
        'requester_id' => $a->id,
        'addressee_id' => $b->id,
        'status' => 'accepted',
        'pair_key' => Friendship::pairKeyFor($a->id, $b->id),
    ]);
}

it('rejects starting a direct conversation with a non-friend', function () {
    $a = userWithRole('player');
    $b = userWithRole('player');

    $this->actingAs($a)->postJson('/api/social/conversations', [
        'type' => 'direct',
        'user_id' => $b->id,
    ])->assertStatus(422);
});

it('creates a direct conversation between friends and reuses the same thread on repeat', function () {
    $a = userWithRole('player');
    $b = userWithRole('coach');
    makeFriends($a, $b);

    $first = $this->actingAs($a)->postJson('/api/social/conversations', ['type' => 'direct', 'user_id' => $b->id]);
    $first->assertCreated();

    $second = $this->actingAs($a)->postJson('/api/social/conversations', ['type' => 'direct', 'user_id' => $b->id]);
    $second->assertCreated();

    expect($second->json('id'))->toBe($first->json('id'));

    // The other side starting it back should also resolve to the same thread.
    $third = $this->actingAs($b)->postJson('/api/social/conversations', ['type' => 'direct', 'user_id' => $a->id]);
    expect($third->json('id'))->toBe($first->json('id'));
});

it('creates a group conversation only when every participant is a friend of the creator', function () {
    $creator = userWithRole('player');
    $friend = userWithRole('player');
    $stranger = userWithRole('player');
    makeFriends($creator, $friend);

    $this->actingAs($creator)->postJson('/api/social/conversations', [
        'type' => 'group',
        'name' => 'Weekend Squad',
        'participant_ids' => [$friend->id, $stranger->id],
    ])->assertStatus(422);

    $response = $this->actingAs($creator)->postJson('/api/social/conversations', [
        'type' => 'group',
        'name' => 'Weekend Squad',
        'participant_ids' => [$friend->id],
    ]);

    $response->assertCreated();
    $response->assertJsonPath('name', 'Weekend Squad');
    expect(collect($response->json('participants'))->pluck('id'))->toContain($creator->id, $friend->id);
});

it('sends and lists messages only for conversation participants, broadcasting live', function () {
    $a = userWithRole('player');
    $b = userWithRole('coach');
    $stranger = userWithRole('player');
    makeFriends($a, $b);

    $conversation = $this->actingAs($a)->postJson('/api/social/conversations', ['type' => 'direct', 'user_id' => $b->id])->json();

    $this->actingAs($stranger)->getJson("/api/social/conversations/{$conversation['id']}/messages")->assertForbidden();
    $this->actingAs($stranger)->postJson("/api/social/conversations/{$conversation['id']}/messages", ['body' => 'hi'])->assertForbidden();

    $send = $this->actingAs($a)->postJson("/api/social/conversations/{$conversation['id']}/messages", ['body' => 'Hello!']);
    $send->assertCreated();
    $send->assertJsonPath('body', 'Hello!');

    $this->actingAs($b)->getJson("/api/social/conversations/{$conversation['id']}/messages")
        ->assertOk()
        ->assertJsonPath('data.0.body', 'Hello!');
});

it('only allows adding a participant to a group conversation, and only if they are a friend of the adder', function () {
    $creator = userWithRole('player');
    $friend = userWithRole('player');
    $newFriend = userWithRole('player');
    $nonFriend = userWithRole('player');
    makeFriends($creator, $friend);
    makeFriends($creator, $newFriend);

    $group = $this->actingAs($creator)->postJson('/api/social/conversations', [
        'type' => 'group', 'name' => 'Team', 'participant_ids' => [$friend->id],
    ])->json();

    $this->actingAs($creator)->postJson("/api/social/conversations/{$group['id']}/participants", [
        'user_id' => $nonFriend->id,
    ])->assertStatus(422);

    $this->actingAs($creator)->postJson("/api/social/conversations/{$group['id']}/participants", [
        'user_id' => $newFriend->id,
    ])->assertOk();

    $direct = $this->actingAs($creator)->postJson('/api/social/conversations', ['type' => 'direct', 'user_id' => $friend->id])->json();
    $this->actingAs($creator)->postJson("/api/social/conversations/{$direct['id']}/participants", [
        'user_id' => $newFriend->id,
    ])->assertForbidden();
});
