<?php

use App\Models\MatchmakingMatch;
use App\Models\MatchmakingRequest;
use App\Models\Sport;
use App\Models\Venue;
use App\Models\VenueRegistration;
use App\Services\MatchmakingCleanupService;

function makeCleanupTestVenue(): Venue
{
    $facilitator = userWithRole('venue_facilitator');

    return Venue::create([
        'facilitator_id' => $facilitator->id,
        'name' => 'Cleanup Test Venue',
        'address' => '1 Test St',
        'latitude' => 1,
        'longitude' => 1,
        'status' => 'active',
    ]);
}

it('removes an open request whose preferred start time has passed', function () {
    $player = userWithRole('player');
    $sport = Sport::create(['name' => 'Cycling']);

    $request = MatchmakingRequest::create([
        'user_id' => $player->id,
        'sport_id' => $sport->id,
        'status' => 'open',
        'preferred_start_at' => now()->subHour(),
    ]);

    MatchmakingCleanupService::run();

    $this->assertModelMissing($request);
});

it('removes a stale open request with no preferred time after the default TTL', function () {
    $player = userWithRole('player');
    $sport = Sport::create(['name' => 'Rowing']);

    $request = MatchmakingRequest::create([
        'user_id' => $player->id,
        'sport_id' => $sport->id,
        'status' => 'open',
    ]);
    $request->forceFill(['created_at' => now()->subHours(25)])->save();

    MatchmakingCleanupService::run();

    $this->assertModelMissing($request);
});

it('keeps an open request that is still within its window', function () {
    $player = userWithRole('player');
    $sport = Sport::create(['name' => 'Archery']);

    $request = MatchmakingRequest::create([
        'user_id' => $player->id,
        'sport_id' => $sport->id,
        'status' => 'open',
        'preferred_start_at' => now()->addHour(),
    ]);

    MatchmakingCleanupService::run();

    $this->assertModelExists($request);
});

it('removes a matched pair once their meetup time has passed', function () {
    $playerA = userWithRole('player');
    $playerB = userWithRole('player');
    $sport = Sport::create(['name' => 'Fencing']);

    $requestA = MatchmakingRequest::create([
        'user_id' => $playerA->id,
        'sport_id' => $sport->id,
        'status' => 'matched',
        'preferred_start_at' => now()->subHours(2),
        'preferred_end_at' => now()->subHour(),
    ]);
    $requestB = MatchmakingRequest::create([
        'user_id' => $playerB->id,
        'sport_id' => $sport->id,
        'status' => 'matched',
    ]);
    $match = MatchmakingMatch::create([
        'request_a_id' => $requestA->id,
        'request_b_id' => $requestB->id,
        'matched_at' => now()->subHours(3),
    ]);

    MatchmakingCleanupService::run();

    $this->assertModelMissing($match);
    $this->assertModelMissing($requestA);
    $this->assertModelMissing($requestB);
});

it('removes a matched pair with no explicit time after the default grace period', function () {
    $playerA = userWithRole('player');
    $playerB = userWithRole('player');
    $sport = Sport::create(['name' => 'Judo']);

    $requestA = MatchmakingRequest::create(['user_id' => $playerA->id, 'sport_id' => $sport->id, 'status' => 'matched']);
    $requestB = MatchmakingRequest::create(['user_id' => $playerB->id, 'sport_id' => $sport->id, 'status' => 'matched']);
    $match = MatchmakingMatch::create([
        'request_a_id' => $requestA->id,
        'request_b_id' => $requestB->id,
        'matched_at' => now()->subHours(4),
    ]);

    MatchmakingCleanupService::run();

    $this->assertModelMissing($match);
});

it('keeps a matched pair still within the default grace period', function () {
    $playerA = userWithRole('player');
    $playerB = userWithRole('player');
    $sport = Sport::create(['name' => 'Karate']);

    $requestA = MatchmakingRequest::create(['user_id' => $playerA->id, 'sport_id' => $sport->id, 'status' => 'matched']);
    $requestB = MatchmakingRequest::create(['user_id' => $playerB->id, 'sport_id' => $sport->id, 'status' => 'matched']);
    $match = MatchmakingMatch::create([
        'request_a_id' => $requestA->id,
        'request_b_id' => $requestB->id,
        'matched_at' => now()->subHour(),
    ]);

    MatchmakingCleanupService::run();

    $this->assertModelExists($match);
});

it('auto-cancels a paired match\'s reservation once the facilitator has not responded and the start time is within an hour, failing both requests and notifying both players', function () {
    $venue = makeCleanupTestVenue();
    $playerA = userWithRole('player');
    $playerB = userWithRole('player');
    $sport = Sport::create(['name' => 'Squash']);

    $starts = now()->addMinutes(30);
    $ends = now()->addMinutes(90);

    $registration = VenueRegistration::create([
        'venue_id' => $venue->id,
        'user_id' => $playerA->id,
        'starts_at' => $starts,
        'ends_at' => $ends,
        'status' => 'pending',
    ]);

    $requestA = MatchmakingRequest::create([
        'user_id' => $playerA->id, 'sport_id' => $sport->id, 'status' => 'matched',
        'venue_id' => $venue->id, 'preferred_start_at' => $starts, 'preferred_end_at' => $ends,
    ]);
    $requestB = MatchmakingRequest::create([
        'user_id' => $playerB->id, 'sport_id' => $sport->id, 'status' => 'matched',
        'venue_id' => $venue->id, 'preferred_start_at' => $starts, 'preferred_end_at' => $ends,
    ]);
    MatchmakingMatch::create([
        'request_a_id' => $requestA->id,
        'request_b_id' => $requestB->id,
        'matched_at' => now()->subMinutes(10),
        'venue_registration_id' => $registration->id,
    ]);

    MatchmakingCleanupService::run();

    expect($registration->fresh()->status)->toBe('cancelled');
    expect($requestA->fresh()->status)->toBe('failed');
    expect($requestB->fresh()->status)->toBe('failed');

    foreach ([$playerA, $playerB] as $player) {
        $notifications = $this->actingAs($player)->getJson('/api/notifications')->assertOk();
        expect($notifications->json('0.type'))->toBe('matchmaking_reservation_expired');
        expect($notifications->json('0.data.venue_name'))->toBe($venue->name);
    }
});

it('leaves an unresponded reservation alone while its start time is still more than an hour away', function () {
    $venue = makeCleanupTestVenue();
    $playerA = userWithRole('player');
    $playerB = userWithRole('player');
    $sport = Sport::create(['name' => 'Squash']);

    $starts = now()->addHours(2);
    $ends = now()->addHours(3);

    $registration = VenueRegistration::create([
        'venue_id' => $venue->id,
        'user_id' => $playerA->id,
        'starts_at' => $starts,
        'ends_at' => $ends,
        'status' => 'pending',
    ]);

    $requestA = MatchmakingRequest::create([
        'user_id' => $playerA->id, 'sport_id' => $sport->id, 'status' => 'matched',
        'venue_id' => $venue->id, 'preferred_start_at' => $starts, 'preferred_end_at' => $ends,
    ]);
    $requestB = MatchmakingRequest::create([
        'user_id' => $playerB->id, 'sport_id' => $sport->id, 'status' => 'matched',
        'venue_id' => $venue->id, 'preferred_start_at' => $starts, 'preferred_end_at' => $ends,
    ]);
    MatchmakingMatch::create([
        'request_a_id' => $requestA->id,
        'request_b_id' => $requestB->id,
        'matched_at' => now()->subMinutes(10),
        'venue_registration_id' => $registration->id,
    ]);

    MatchmakingCleanupService::run();

    expect($registration->fresh()->status)->toBe('pending');
    expect($requestA->fresh()->status)->toBe('matched');
    expect($requestB->fresh()->status)->toBe('matched');
});

it('leaves an already-approved reservation alone even once its start time is within an hour', function () {
    $venue = makeCleanupTestVenue();
    $playerA = userWithRole('player');
    $playerB = userWithRole('player');
    $sport = Sport::create(['name' => 'Squash']);

    $starts = now()->addMinutes(30);
    $ends = now()->addMinutes(90);

    $registration = VenueRegistration::create([
        'venue_id' => $venue->id,
        'user_id' => $playerA->id,
        'starts_at' => $starts,
        'ends_at' => $ends,
        'status' => 'approved',
    ]);

    $requestA = MatchmakingRequest::create([
        'user_id' => $playerA->id, 'sport_id' => $sport->id, 'status' => 'matched',
        'venue_id' => $venue->id, 'preferred_start_at' => $starts, 'preferred_end_at' => $ends,
    ]);
    $requestB = MatchmakingRequest::create([
        'user_id' => $playerB->id, 'sport_id' => $sport->id, 'status' => 'matched',
        'venue_id' => $venue->id, 'preferred_start_at' => $starts, 'preferred_end_at' => $ends,
    ]);
    MatchmakingMatch::create([
        'request_a_id' => $requestA->id,
        'request_b_id' => $requestB->id,
        'matched_at' => now()->subMinutes(10),
        'venue_registration_id' => $registration->id,
    ]);

    MatchmakingCleanupService::run();

    expect($registration->fresh()->status)->toBe('approved');
    expect($requestA->fresh()->status)->toBe('matched');
    expect($requestB->fresh()->status)->toBe('matched');
});
