<?php

use App\Models\Friendship;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

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

it('lists conversations with the last messages sender eager-loaded', function () {
    $a = userWithRole('player');
    $b = userWithRole('coach');
    makeFriends($a, $b);

    $conversation = $this->actingAs($a)->postJson('/api/social/conversations', ['type' => 'direct', 'user_id' => $b->id])->json();
    $this->actingAs($a)->postJson("/api/social/conversations/{$conversation['id']}/messages", ['body' => 'Hello!']);

    // The frontend's unread-indicator logic reads messages.0.user.id directly
    // (no optional chaining) — if this relation isn't eager-loaded, `user` is
    // silently omitted from the JSON entirely and the list view throws.
    $this->actingAs($b)->getJson('/api/social/conversations')
        ->assertOk()
        ->assertJsonPath('0.messages.0.body', 'Hello!')
        ->assertJsonPath('0.messages.0.user.id', $a->id);
});

it('marks a conversation read only for the requesting participant, and denies non-participants', function () {
    $a = userWithRole('player');
    $b = userWithRole('coach');
    $stranger = userWithRole('player');
    makeFriends($a, $b);

    $conversation = $this->actingAs($a)->postJson('/api/social/conversations', ['type' => 'direct', 'user_id' => $b->id])->json();

    $this->actingAs($stranger)->postJson("/api/social/conversations/{$conversation['id']}/read")->assertForbidden();
    $this->actingAs($a)->postJson("/api/social/conversations/{$conversation['id']}/read")->assertNoContent();

    $aPivot = $a->conversations()->find($conversation['id'])->pivot;
    $bPivot = $b->conversations()->find($conversation['id'])->pivot;

    expect($aPivot->last_read_at)->not->toBeNull();
    expect($bPivot->last_read_at)->toBeNull();
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

it('lets a player, coach, venue facilitator, or any organizer-family role contact the admin without being friends, reusing the same thread on repeat', function () {
    $admin = userWithRole('admin');

    foreach (['player', 'coach', 'venue_facilitator', 'organizer', 'venue_organizer', 'livestream_organizer'] as $role) {
        $user = userWithRole($role);

        $first = $this->actingAs($user)->postJson('/api/social/conversations/contact-admin');
        $first->assertCreated();
        $first->assertJsonPath('type', 'direct');
        expect(collect($first->json('participants'))->pluck('id'))->toContain($user->id, $admin->id);

        $second = $this->actingAs($user)->postJson('/api/social/conversations/contact-admin');
        expect($second->json('id'))->toBe($first->json('id'));
    }
});

it('flags only the admin participant as is_admin, on the FAQ thread and nowhere else', function () {
    $admin = userWithRole('admin');
    $player = userWithRole('player');
    $coach = userWithRole('coach');

    $faqThread = $this->actingAs($player)->postJson('/api/social/conversations/contact-admin')->assertCreated()->json();
    $flags = collect($faqThread['participants'])->keyBy('id')->map->is_admin;
    expect($flags[$admin->id])->toBeTrue();
    expect($flags[$player->id])->toBeFalse();

    // The admin's own inbox listing carries the same flag, so their client
    // could (in principle) tell it's their own FAQ thread too — but the
    // OTHER participant (the player) is correctly never flagged.
    $adminsView = $this->actingAs($admin)->getJson('/api/social/conversations')->assertOk()->json();
    $thread = collect($adminsView)->firstWhere('id', $faqThread['id']);
    $theirFlags = collect($thread['participants'])->keyBy('id')->map->is_admin;
    expect($theirFlags[$admin->id])->toBeTrue();
    expect($theirFlags[$player->id])->toBeFalse();

    // An ordinary friend-to-friend conversation never flags anyone.
    makeFriends($player, $coach);
    $friendThread = $this->actingAs($player)->postJson('/api/social/conversations', [
        'type' => 'direct', 'user_id' => $coach->id,
    ])->assertCreated()->json();
    expect(collect($friendThread['participants'])->pluck('is_admin')->contains(true))->toBeFalse();
});

it("denies the admin from contacting themselves, and lets the organizer-family participants message each other", function () {
    $admin = userWithRole('admin');

    // Every non-admin role is now allowed onto this route (see the test
    // above) — admin is the one role deliberately excluded, both at the
    // route's own role middleware and, defense in depth, by contactAdmin()'s
    // own "You are the admin" guard should that middleware ever be widened.
    $this->actingAs($admin)->postJson('/api/social/conversations/contact-admin')->assertForbidden();

    $organizer = userWithRole('organizer');
    $conversation = $this->actingAs($organizer)->postJson('/api/social/conversations/contact-admin')->json();

    $this->actingAs($organizer)->postJson("/api/social/conversations/{$conversation['id']}/messages", [
        'body' => 'How do I reset my password?',
    ])->assertCreated();

    $this->actingAs($admin)->getJson("/api/social/conversations/{$conversation['id']}/messages")
        ->assertOk()
        ->assertJsonPath('data.0.body', 'How do I reset my password?');
});

it('lets a message carry a photo with no caption, but rejects one with neither body nor attachment', function () {
    Storage::fake('public');

    $a = userWithRole('player');
    $b = userWithRole('coach');
    makeFriends($a, $b);
    $conversation = $this->actingAs($a)->postJson('/api/social/conversations', ['type' => 'direct', 'user_id' => $b->id])->json();

    $this->actingAs($a)->postJson("/api/social/conversations/{$conversation['id']}/messages", [])
        ->assertStatus(422);

    $response = $this->actingAs($a)->postJson("/api/social/conversations/{$conversation['id']}/messages", [
        'attachment' => UploadedFile::fake()->create('gcash-receipt.jpg', 100, 'image/jpeg'),
    ]);
    $response->assertCreated();
    expect($response->json('attachment_url'))->not->toBeNull();
    expect($response->json('body'))->toBe('');
});

it('lists every organizer-family member except the caller, with each one\'s role, for the organizer directory', function () {
    $mainOrganizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');
    userWithRole('player'); // never appears in this directory

    $directory = $this->actingAs($mainOrganizer)->getJson('/api/social/organizer-directory')->assertOk()->json();

    expect(collect($directory)->pluck('id'))
        ->toContain($venueOrganizer->id, $livestreamOrganizer->id)
        ->not->toContain($mainOrganizer->id);
    expect(collect($directory)->firstWhere('id', $venueOrganizer->id)['role'])->toBe('venue_organizer');
});

it('denies every non-organizer-family role from the organizer directory and the colleague endpoint', function () {
    foreach (['player', 'coach', 'venue_facilitator', 'admin'] as $role) {
        $user = userWithRole($role);
        $this->actingAs($user)->getJson('/api/social/organizer-directory')->assertForbidden();
        $this->actingAs($user)->postJson('/api/social/conversations/contact-colleague', ['user_id' => 1])->assertForbidden();
    }
});

it('lets any organizer-family role message any other one without being friends, both directions, reusing the same thread', function () {
    $mainOrganizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');

    $first = $this->actingAs($mainOrganizer)->postJson('/api/social/conversations/contact-colleague', [
        'user_id' => $venueOrganizer->id,
    ]);
    $first->assertCreated();
    expect(collect($first->json('participants'))->pluck('id'))->toContain($mainOrganizer->id, $venueOrganizer->id);

    // The venue organizer messaging the main organizer back resolves to the
    // exact same thread, not a duplicate.
    $second = $this->actingAs($venueOrganizer)->postJson('/api/social/conversations/contact-colleague', [
        'user_id' => $mainOrganizer->id,
    ]);
    expect($second->json('id'))->toBe($first->json('id'));

    // A completely different pairing within the family — livestream
    // organizer to venue organizer — works too, and lands in its own thread.
    $third = $this->actingAs($livestreamOrganizer)->postJson('/api/social/conversations/contact-colleague', [
        'user_id' => $venueOrganizer->id,
    ]);
    $third->assertCreated();
    expect($third->json('id'))->not->toBe($first->json('id'));
});

it('rejects contacting a colleague who is not part of the organizer family, and rejects messaging yourself', function () {
    $organizer = userWithRole('organizer');
    $player = userWithRole('player');

    $this->actingAs($organizer)->postJson('/api/social/conversations/contact-colleague', [
        'user_id' => $player->id,
    ])->assertStatus(422);

    $this->actingAs($organizer)->postJson('/api/social/conversations/contact-colleague', [
        'user_id' => $organizer->id,
    ])->assertStatus(422);
});
