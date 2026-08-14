<?php

use App\Models\Notification;
use App\Models\Sport;
use App\Models\SportFormat;
use App\Models\Tournament;
use App\Models\TournamentRegistration;
use App\Models\Venue;
use App\Models\VenueRegistration;

it('notifies the addressee when a friend request is sent, and the requester when it is accepted', function () {
    $requester = userWithRole('player');
    $addressee = userWithRole('player');

    $friendshipId = $this->actingAs($requester)->postJson('/api/social/friend-requests', [
        'addressee_id' => $addressee->id,
    ])->assertCreated()->json('id');

    $addresseeNotifications = $this->actingAs($addressee)->getJson('/api/notifications')->assertOk();
    expect($addresseeNotifications->json('0.type'))->toBe('friend_request');
    expect($addresseeNotifications->json('0.data.requester_name'))->toBe($requester->name);

    $this->actingAs($addressee)->postJson("/api/social/friend-requests/{$friendshipId}/accept")->assertOk();

    $requesterNotifications = $this->actingAs($requester)->getJson('/api/notifications')->assertOk();
    expect($requesterNotifications->json('0.type'))->toBe('friend_request_accepted');
    expect($requesterNotifications->json('0.data.addressee_name'))->toBe($addressee->name);
});

it('notifies the booker when their venue booking is approved, but not when rejected', function () {
    $facilitator = userWithRole('venue_facilitator');
    $player = userWithRole('player');
    $venue = Venue::create([
        'facilitator_id' => $facilitator->id, 'name' => 'Notify Venue', 'address' => '1 St', 'latitude' => 1, 'longitude' => 1,
    ]);

    $approved = VenueRegistration::create([
        'venue_id' => $venue->id, 'user_id' => $player->id,
        'starts_at' => now()->addDay(), 'ends_at' => now()->addDay()->addHour(), 'status' => 'pending',
    ]);
    $rejected = VenueRegistration::create([
        'venue_id' => $venue->id, 'user_id' => $player->id,
        'starts_at' => now()->addDays(2), 'ends_at' => now()->addDays(2)->addHour(), 'status' => 'pending',
    ]);

    $this->actingAs($facilitator)->patchJson("/api/venue-registrations/{$approved->id}", ['status' => 'approved'])->assertOk();
    $this->actingAs($facilitator)->patchJson("/api/venue-registrations/{$rejected->id}", ['status' => 'rejected'])->assertOk();

    $notifications = $this->actingAs($player)->getJson('/api/notifications')->assertOk();
    expect($notifications->json())->toHaveCount(1);
    expect($notifications->json('0.type'))->toBe('booking_approved');
    expect($notifications->json('0.data.venue_name'))->toBe('Notify Venue');
});

it('notifies both players when matchmaking pairs them', function () {
    $playerA = userWithRole('player');
    $playerB = userWithRole('player');
    $sport = Sport::create(['name' => 'Table Tennis']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => 'Singles', 'players_per_side' => 1]);

    $this->actingAs($playerA)->postJson('/api/matchmaking-requests', [
        'sport_id' => $sport->id, 'sport_format_id' => $format->id,
    ])->assertCreated();
    $this->actingAs($playerB)->postJson('/api/matchmaking-requests', [
        'sport_id' => $sport->id, 'sport_format_id' => $format->id,
    ])->assertCreated();

    $notificationsA = $this->actingAs($playerA)->getJson('/api/notifications')->assertOk();
    expect($notificationsA->json('0.type'))->toBe('matchmaking_paired');
    expect($notificationsA->json('0.data.opponent_name'))->toBe($playerB->name);

    $notificationsB = $this->actingAs($playerB)->getJson('/api/notifications')->assertOk();
    expect($notificationsB->json('0.type'))->toBe('matchmaking_paired');
    expect($notificationsB->json('0.data.opponent_name'))->toBe($playerA->name);
});

it('notifies a player when a coach registers them for a tournament', function () {
    $coach = userWithRole('coach');
    $player = userWithRole('player');
    $sport = Sport::create(['name' => 'Chess']);
    $tournament = Tournament::create([
        'organizer_id' => userWithRole('organizer')->id, 'sport_id' => $sport->id,
        'name' => 'Notify Cup', 'format' => 'single_elimination', 'starts_at' => now()->addWeek(), 'status' => 'open',
    ]);

    $this->actingAs($coach)->postJson("/api/tournaments/{$tournament->id}/registrations", [
        'user_id' => $player->id,
    ])->assertCreated();

    $notifications = $this->actingAs($player)->getJson('/api/notifications')->assertOk();
    expect($notifications->json('0.type'))->toBe('tournament_update');
    expect($notifications->json('0.data.tournament_name'))->toBe('Notify Cup');
});

it('notifies every registrant when a bracket is generated and when a round advances', function () {
    $organizer = userWithRole('organizer');
    $sport = Sport::create(['name' => 'Badminton']);
    $tournament = Tournament::create([
        'organizer_id' => $organizer->id, 'sport_id' => $sport->id,
        'name' => 'Round Cup', 'format' => 'single_elimination', 'starts_at' => now()->addWeek(), 'status' => 'open',
    ]);

    $players = collect(range(1, 4))->map(function () use ($tournament) {
        $player = userWithRole('player');
        TournamentRegistration::create(['tournament_id' => $tournament->id, 'user_id' => $player->id, 'status' => 'pending']);

        return $player;
    });

    $this->actingAs($organizer)->postJson("/api/tournaments/{$tournament->id}/generate-bracket")->assertCreated();

    foreach ($players as $player) {
        $notifications = $this->actingAs($player)->getJson('/api/notifications')->assertOk();
        expect($notifications->json('0.type'))->toBe('tournament_update');
        expect($notifications->json('0.data.message'))->toContain('bracket');
    }

    $round1 = $this->actingAs($organizer)->getJson("/api/tournaments/{$tournament->id}/bracket")->json('structure.0');
    foreach ($round1 as $match) {
        $this->actingAs($organizer)->patchJson("/api/matches/{$match['id']}/score", [
            'score_a' => 21, 'score_b' => 10, 'status' => 'completed',
        ])->assertOk();
    }

    foreach ($players as $player) {
        $notifications = $this->actingAs($player)->getJson('/api/notifications')->assertOk();
        expect($notifications->json('0.type'))->toBe('tournament_update');
        expect($notifications->json('0.data.message'))->toContain('Round 2');
    }
});

it('lets a user mark a single notification read, or all of them at once, but only their own', function () {
    $player = userWithRole('player');
    $other = userWithRole('player');

    $n1 = Notification::create(['user_id' => $player->id, 'type' => 'booking_approved', 'data' => ['x' => 1]]);
    $n2 = Notification::create(['user_id' => $player->id, 'type' => 'booking_approved', 'data' => ['x' => 2]]);

    $this->actingAs($other)->postJson("/api/notifications/{$n1->id}/read")->assertForbidden();

    $this->actingAs($player)->postJson("/api/notifications/{$n1->id}/read")->assertOk();
    expect($n1->fresh()->read_at)->not->toBeNull();
    expect($n2->fresh()->read_at)->toBeNull();

    $this->actingAs($player)->postJson('/api/notifications/read-all')->assertNoContent();
    expect($n2->fresh()->read_at)->not->toBeNull();
});
