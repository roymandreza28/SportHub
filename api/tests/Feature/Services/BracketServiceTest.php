<?php

use App\Models\GameMatch;
use App\Models\Sport;
use App\Models\Tournament;
use App\Models\TournamentRegistration;
use App\Models\User;
use App\Services\BracketService;

function makeTournament(string $format, int $playerCount): Tournament
{
    $organizer = User::factory()->create();
    $sport = Sport::create(['name' => 'Test Sport '.uniqid(), 'category' => 'team']);

    $tournament = Tournament::create([
        'organizer_id' => $organizer->id,
        'sport_id' => $sport->id,
        'name' => 'Test Tournament',
        'format' => $format,
        'starts_at' => now()->addWeek(),
        'status' => 'open',
    ]);

    for ($i = 0; $i < $playerCount; $i++) {
        $player = User::factory()->create();
        TournamentRegistration::create([
            'tournament_id' => $tournament->id,
            'user_id' => $player->id,
            'status' => 'pending',
        ]);
    }

    return $tournament;
}

it('gives every match at most one bye, never two, for any player count from 2 to 16', function (int $playerCount) {
    $tournament = makeTournament('single_elimination', $playerCount);
    $bracket = app(BracketService::class)->generate($tournament);

    $round1 = $bracket->matches()->where('round', 1)->get();

    foreach ($round1 as $match) {
        $emptySlots = collect([$match->participant_a_id, $match->participant_b_id])->filter(fn ($id) => is_null($id))->count();
        expect($emptySlots)->toBeLessThanOrEqual(1);
    }
})->with([2, 3, 4, 5, 6, 7, 8, 9, 15, 16]);

it('does not auto-complete a real match between two bye-winners', function () {
    // 5 players => bracket size 8 => 3 byes, exactly the scenario that
    // triggered the original bug: two round-1 byes feed the same round-2
    // match, which must remain a genuine match to be played, not a
    // silently-completed fake bye.
    $tournament = makeTournament('single_elimination', 5);
    $bracket = app(BracketService::class)->generate($tournament);

    $round2 = $bracket->matches()->where('round', 2)->get();
    $bothReal = $round2->first(fn (GameMatch $m) => $m->participant_a_id && $m->participant_b_id);

    expect($bothReal)->not->toBeNull();
    expect($bothReal->status)->toBe('scheduled');
    expect($bothReal->winner_id)->toBeNull();
});

it('propagates a scored winner into the next round and completes the tournament on the final', function () {
    $tournament = makeTournament('single_elimination', 2);
    $service = app(BracketService::class);
    $bracket = $service->generate($tournament);

    $final = $bracket->matches()->where('round', 1)->first();
    expect($final->participant_a_id)->not->toBeNull();
    expect($final->participant_b_id)->not->toBeNull();

    $final->update(['score_a' => 21, 'score_b' => 15, 'status' => 'completed', 'winner_id' => $final->participant_a_id]);
    $service->advanceWinner($final->fresh());

    expect($tournament->fresh()->status)->toBe('completed');
});

it('generates all-pairs round-robin matches with no byes', function () {
    $tournament = makeTournament('round_robin', 4);
    $bracket = app(BracketService::class)->generate($tournament);

    // 4 players -> C(4,2) = 6 matches, all round 1, no nulls.
    $matches = $bracket->matches;
    expect($matches)->toHaveCount(6);
    expect($matches->every(fn (GameMatch $m) => $m->round === 1))->toBeTrue();
    expect($matches->every(fn (GameMatch $m) => $m->participant_a_id && $m->participant_b_id))->toBeTrue();
});

it('rebuilds structure as a jsonb-ready array grouped by round', function () {
    $tournament = makeTournament('single_elimination', 4);
    $bracket = app(BracketService::class)->generate($tournament);

    expect($bracket->structure)->toBeArray();
    expect($bracket->structure)->toHaveCount(2); // 4 players -> 2 rounds
    expect($bracket->structure[0])->toHaveCount(2); // round 1: 2 matches
    expect($bracket->structure[1])->toHaveCount(1); // round 2 (final): 1 match
});
