<?php

use App\Models\MatchmakingMatch;
use App\Models\MatchmakingRequest;
use App\Models\Sport;
use App\Services\MatchmakingCleanupService;

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
