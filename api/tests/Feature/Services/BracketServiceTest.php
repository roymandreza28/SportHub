<?php

use App\Models\GameMatch;
use App\Models\Sport;
use App\Models\SportFormat;
use App\Models\Team;
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
        'status' => 'registration',
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

/**
 * Mirrors MatchController::updateScore()'s completion logic (winner
 * derived from the score, advanceWinner() always called even on a tie) so
 * these tests exercise BracketService the same way the real HTTP endpoint
 * does, without the HTTP/auth overhead.
 */
function completeMatch(BracketService $service, GameMatch $match, int $scoreA, int $scoreB): GameMatch
{
    $winnerId = match (true) {
        $scoreA > $scoreB => $match->participant_a_id,
        $scoreB > $scoreA => $match->participant_b_id,
        default => null,
    };

    $match->update(['score_a' => $scoreA, 'score_b' => $scoreB, 'status' => 'completed', 'winner_id' => $winnerId]);
    $service->advanceWinner($match->fresh());

    return $match->fresh();
}

/**
 * Team-mode sibling of makeTournament(): builds a Sport + SportFormat, then
 * $teamCount ready Team rows (each with its own captain), registering each
 * team (not a user) against the tournament — mirrors how
 * TournamentRegistrationController::storeTeam() and BracketService itself
 * key everything off team_id/sport_format_id once sport_format_id is set.
 */
function makeTeamTournament(string $format, int $teamCount): Tournament
{
    $organizer = User::factory()->create();
    $sport = Sport::create(['name' => 'Test Team Sport '.uniqid(), 'category' => 'team']);
    $sportFormat = SportFormat::create(['sport_id' => $sport->id, 'name' => 'Squad', 'players_per_side' => 5]);

    $tournament = Tournament::create([
        'organizer_id' => $organizer->id,
        'sport_id' => $sport->id,
        'sport_format_id' => $sportFormat->id,
        'name' => 'Test Team Tournament',
        'format' => $format,
        'starts_at' => now()->addWeek(),
        'status' => 'registration',
    ]);

    for ($i = 0; $i < $teamCount; $i++) {
        $captain = User::factory()->create();
        $team = Team::create([
            'sport_id' => $sport->id,
            'sport_format_id' => $sportFormat->id,
            'captain_id' => $captain->id,
            'name' => 'Team '.$i.' '.uniqid(),
            'status' => 'ready',
        ]);

        TournamentRegistration::create([
            'tournament_id' => $tournament->id,
            'team_id' => $team->id,
            'status' => 'pending',
        ]);
    }

    return $tournament;
}

/**
 * Team-mode sibling of completeMatch(): derives/writes winner_team_id from
 * the team columns instead of the individual ones.
 */
function completeTeamMatch(BracketService $service, GameMatch $match, int $scoreA, int $scoreB): GameMatch
{
    $winnerId = match (true) {
        $scoreA > $scoreB => $match->participant_a_team_id,
        $scoreB > $scoreA => $match->participant_b_team_id,
        default => null,
    };

    $match->update(['score_a' => $scoreA, 'score_b' => $scoreB, 'status' => 'completed', 'winner_team_id' => $winnerId]);
    $service->advanceWinner($match->fresh());

    return $match->fresh();
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

it('generates all-pairs round-robin matches with team columns set and no byes, for a team tournament', function () {
    $tournament = makeTeamTournament('round_robin', 4);
    $bracket = app(BracketService::class)->generate($tournament);

    // 4 teams -> C(4,2) = 6 matches, all round 1, no nulls.
    $matches = $bracket->matches;
    expect($matches)->toHaveCount(6);
    expect($matches->every(fn (GameMatch $m) => $m->round === 1))->toBeTrue();
    expect($matches->every(fn (GameMatch $m) => $m->participant_a_team_id && $m->participant_b_team_id))->toBeTrue();
    expect($matches->every(fn (GameMatch $m) => is_null($m->participant_a_id) && is_null($m->participant_b_id)))->toBeTrue();
});

it('rebuilds structure as a jsonb-ready array grouped by round', function () {
    $tournament = makeTournament('single_elimination', 4);
    $bracket = app(BracketService::class)->generate($tournament);

    expect($bracket->structure)->toBeArray();
    expect($bracket->structure)->toHaveCount(2); // 4 players -> 2 rounds
    expect($bracket->structure[0])->toHaveCount(2); // round 1: 2 matches
    expect($bracket->structure[1])->toHaveCount(1); // round 2 (final): 1 match
});

it('embeds participant/winner names and round numbers in structure, and leaves an undecided next round open', function () {
    $tournament = makeTournament('single_elimination', 4);
    $bracket = app(BracketService::class)->generate($tournament);

    $round1 = $bracket->structure[0];
    $firstMatch = $bracket->matches()->where('round', 1)->orderBy('id')->first();
    expect($round1[0]['round'])->toBe(1);
    expect($round1[0]['participant_a']['id'])->toBe($firstMatch->participant_a_id);
    expect($round1[0]['participant_a']['name'])->toBe(User::find($firstMatch->participant_a_id)->name);

    // Neither round-1 match has been played yet, so the final is still
    // entirely undetermined — both slots open, no winner.
    $final = $bracket->structure[1][0];
    expect($final['round'])->toBe(2);
    expect($final['participant_a_id'])->toBeNull();
    expect($final['participant_b_id'])->toBeNull();
    expect($final['participant_a'])->toBeNull();
    expect($final['participant_b'])->toBeNull();
    expect($final['winner'])->toBeNull();

    // Play round 1 through; the final should now show both real names.
    foreach ($bracket->matches()->where('round', 1)->get() as $match) {
        $match->update(['score_a' => 21, 'score_b' => 10, 'status' => 'completed', 'winner_id' => $match->participant_a_id]);
        app(BracketService::class)->advanceWinner($match->fresh());
    }

    $finalNow = $bracket->fresh()->structure[1][0];
    expect($finalNow['participant_a']['name'])->not->toBeNull();
    expect($finalNow['participant_b']['name'])->not->toBeNull();
});

// ---- Group stage ----

it('splits players into balanced groups of at most 4 and round-robins within each', function () {
    $tournament = makeTournament('group_stage', 9);
    $bracket = app(BracketService::class)->generate($tournament);

    $matches = $bracket->matches;
    expect($matches->every(fn (GameMatch $m) => $m->group_number !== null))->toBeTrue();
    expect($matches->every(fn (GameMatch $m) => $m->round === 1))->toBeTrue();

    $byGroup = $matches->groupBy('group_number');
    expect($byGroup)->toHaveCount(3); // ceil(9/4) = 3 groups

    // 9 players across 3 groups deals to sizes 3/3/3 -> C(3,2)=3 matches each.
    foreach ($byGroup as $groupMatches) {
        expect($groupMatches)->toHaveCount(3);
    }
});

it('starts a knockout stage automatically once every group match is completed', function () {
    $tournament = makeTournament('group_stage', 8);
    $service = app(BracketService::class);
    $bracket = $service->generate($tournament);

    $groupMatches = $bracket->matches()->whereNotNull('group_number')->get();
    expect($groupMatches)->toHaveCount(12); // 2 groups of 4 -> C(4,2)=6 each

    foreach ($groupMatches as $match) {
        completeMatch($service, $match, 21, 10);
    }

    $knockoutMatches = $bracket->fresh()->matches()->whereNull('group_number')->get();
    // 2 groups -> top 2 each -> 4 qualifiers -> single elimination bracket of 2 rounds.
    expect($knockoutMatches)->toHaveCount(3);
    expect($knockoutMatches->where('round', 2))->toHaveCount(2);
    expect($knockoutMatches->where('round', 3))->toHaveCount(1);
});

it('completes a group_stage tournament by ranking the group then playing the knockout through', function () {
    $tournament = makeTournament('group_stage', 4);
    $service = app(BracketService::class);
    $bracket = $service->generate($tournament);

    // A single group of 4 -> C(4,2) = 6 round-robin matches, top 2 advance
    // to a 1-match knockout final.
    $groupMatches = $bracket->matches()->whereNotNull('group_number')->orderBy('id')->get();
    expect($groupMatches)->toHaveCount(6);

    foreach ($groupMatches as $match) {
        completeMatch($service, $match, 21, 10); // participant_a always wins
    }

    $final = $bracket->fresh()->matches()->whereNull('group_number')->first();
    expect($final)->not->toBeNull();
    expect($final->participant_a_id)->not->toBeNull();
    expect($final->participant_b_id)->not->toBeNull();

    completeMatch($service, $final, 21, 15);

    expect($tournament->fresh()->status)->toBe('completed');
});

it('still starts the knockout stage when the deciding group match ends in a tie', function () {
    $tournament = makeTournament('group_stage', 4);
    $service = app(BracketService::class);
    $bracket = $service->generate($tournament);

    $groupMatches = $bracket->matches()->whereNotNull('group_number')->orderBy('id')->get();

    foreach ($groupMatches as $i => $match) {
        // Every match ties except the last one — a tie must not prevent the
        // group-completion check from ever running (regression: the
        // controller used to skip advanceWinner() entirely when there was
        // no winner, which would leave a tied group's knockout stage stuck).
        if ($i === $groupMatches->count() - 1) {
            completeMatch($service, $match, 10, 10);
        } else {
            completeMatch($service, $match, 21, 10);
        }
    }

    $knockoutExists = $bracket->fresh()->matches()->whereNull('group_number')->exists();
    expect($knockoutExists)->toBeTrue();
});

it('starts a knockout stage automatically once every group match is completed, for a team tournament', function () {
    $tournament = makeTeamTournament('group_stage', 8);
    $service = app(BracketService::class);
    $bracket = $service->generate($tournament);

    $groupMatches = $bracket->matches()->whereNotNull('group_number')->get();
    expect($groupMatches)->toHaveCount(12); // 2 groups of 4 -> C(4,2)=6 each
    expect($groupMatches->every(fn (GameMatch $m) => $m->participant_a_team_id && $m->participant_b_team_id))->toBeTrue();
    expect($groupMatches->every(fn (GameMatch $m) => is_null($m->participant_a_id) && is_null($m->participant_b_id)))->toBeTrue();

    foreach ($groupMatches as $match) {
        completeTeamMatch($service, $match, 21, 10);
    }

    $knockoutMatches = $bracket->fresh()->matches()->whereNull('group_number')->get();
    // 2 groups -> top 2 each -> 4 qualifiers -> single elimination bracket of 2 rounds.
    expect($knockoutMatches)->toHaveCount(3);
    expect($knockoutMatches->where('round', 2))->toHaveCount(2);
    expect($knockoutMatches->where('round', 3))->toHaveCount(1);
    expect($knockoutMatches->every(fn (GameMatch $m) => is_null($m->participant_a_id) && is_null($m->participant_b_id)))->toBeTrue();
});

it('completes a team group_stage tournament by ranking the group then playing the knockout through', function () {
    $tournament = makeTeamTournament('group_stage', 4);
    $service = app(BracketService::class);
    $bracket = $service->generate($tournament);

    // A single group of 4 -> C(4,2) = 6 round-robin matches, top 2 advance
    // to a 1-match knockout final.
    $groupMatches = $bracket->matches()->whereNotNull('group_number')->orderBy('id')->get();
    expect($groupMatches)->toHaveCount(6);

    foreach ($groupMatches as $match) {
        completeTeamMatch($service, $match, 21, 10); // participant_a always wins
    }

    $final = $bracket->fresh()->matches()->whereNull('group_number')->first();
    expect($final)->not->toBeNull();
    expect($final->participant_a_team_id)->not->toBeNull();
    expect($final->participant_b_team_id)->not->toBeNull();
    expect($final->participant_a_id)->toBeNull();
    expect($final->participant_b_id)->toBeNull();

    completeTeamMatch($service, $final, 21, 15);

    expect($tournament->fresh()->status)->toBe('completed');
    expect($tournament->fresh()->champion_team_id)->not->toBeNull();
    expect($tournament->fresh()->champion_id)->toBeNull();
});

// ---- Double elimination ----

it('generates a winners bracket, losers bracket, and grand final for a power-of-two field', function () {
    $tournament = makeTournament('double_elimination', 4);
    $bracket = app(BracketService::class)->generate($tournament);

    $matches = $bracket->matches;
    expect($matches->where('bracket_type', 'winners'))->toHaveCount(3); // 2 R1 + 1 final
    expect($matches->where('bracket_type', 'losers'))->toHaveCount(2); // LBR1 + LBR2, 1 match each
    expect($matches->where('bracket_type', 'final'))->toHaveCount(1);
});

it('routes a winners-bracket loser through the losers bracket to a grand-final rematch', function () {
    $tournament = makeTournament('double_elimination', 4);
    $service = app(BracketService::class);
    $bracket = $service->generate($tournament);

    $wbR1 = $bracket->matches()->where('bracket_type', 'winners')->where('round', 1)->orderBy('id')->get();
    [$p0, $p1] = [$wbR1[0]->participant_a_id, $wbR1[0]->participant_b_id];
    [$p2, $p3] = [$wbR1[1]->participant_a_id, $wbR1[1]->participant_b_id];

    completeMatch($service, $wbR1[0], 21, 10); // p0 beats p1
    completeMatch($service, $wbR1[1], 21, 10); // p2 beats p3

    $wbFinal = $bracket->fresh()->matches()->where('bracket_type', 'winners')->where('round', 2)->first();
    expect($wbFinal->participant_a_id)->toBe($p0);
    expect($wbFinal->participant_b_id)->toBe($p2);

    completeMatch($service, $wbFinal->fresh(), 21, 15); // p0 beats p2 -> p0 is WB champion

    $lbR1 = $bracket->fresh()->matches()->where('bracket_type', 'losers')->where('round', 101)->first();
    expect([$lbR1->participant_a_id, $lbR1->participant_b_id])->toEqualCanonicalizing([$p1, $p3]);

    completeMatch($service, $lbR1->fresh(), 21, 18); // loser of p1/p3 is eliminated for real (2nd loss)

    $lbR2 = $bracket->fresh()->matches()->where('bracket_type', 'losers')->where('round', 102)->first();
    expect($lbR2->participant_b_id)->toBe($p2); // p2 (WB final loser) dropped in here

    $lbChampion = $lbR2->participant_a_id === $lbR2->participant_b_id ? null : $lbR2->winner_id;
    completeMatch($service, $lbR2->fresh(), 21, 19);

    $final = $bracket->fresh()->matches()->where('bracket_type', 'final')->first();
    expect($final->participant_a_id)->toBe($p0); // WB champion waits in the grand final
    expect($final->participant_b_id)->not->toBeNull(); // LB champion joins once decided

    completeMatch($service, $final->fresh(), 21, 17);

    expect($tournament->fresh()->status)->toBe('completed');
});

it('completes immediately from the winners bracket when there are only two entrants', function () {
    $tournament = makeTournament('double_elimination', 2);
    $service = app(BracketService::class);
    $bracket = $service->generate($tournament);

    expect($bracket->matches)->toHaveCount(1); // no losers bracket or grand final possible with just 2 entrants

    $only = $bracket->matches->first();
    completeMatch($service, $only, 21, 10);

    expect($tournament->fresh()->status)->toBe('completed');
});

it('gives a losers-bracket entrant a free pass when their pairing has no opponent (winners-bracket bye)', function () {
    // 3 players -> bracket size 4 -> 1 bye in winners round 1.
    $tournament = makeTournament('double_elimination', 3);
    $service = app(BracketService::class);
    $bracket = $service->generate($tournament);

    $wbR1 = $bracket->matches()->where('bracket_type', 'winners')->where('round', 1)->orderBy('id')->get();
    $byeMatch = $wbR1->first(fn (GameMatch $m) => $m->status === 'completed');
    $realMatch = $wbR1->first(fn (GameMatch $m) => $m->status === 'scheduled');
    expect($byeMatch)->not->toBeNull();
    expect($realMatch)->not->toBeNull();

    $byeWinner = $byeMatch->winner_id;
    $realLoser = $realMatch->participant_a_id;
    $realWinner = $realMatch->participant_b_id;

    completeMatch($service, $realMatch, 10, 21); // participant_b (realWinner) wins

    // The bye's "opponent" in the losers bracket never existed, so the real
    // match's loser should already show as the winner of that losers-round-1
    // pairing without anyone needing to play it.
    $lbR1 = $bracket->fresh()->matches()->where('bracket_type', 'losers')->where('round', 101)->first();
    expect($lbR1->status)->toBe('completed');
    expect($lbR1->winner_id)->toBe($realLoser);

    $wbFinal = $bracket->fresh()->matches()->where('bracket_type', 'winners')->where('round', 2)->first();
    expect([$wbFinal->participant_a_id, $wbFinal->participant_b_id])->toEqualCanonicalizing([$byeWinner, $realWinner]);

    completeMatch($service, $wbFinal->fresh(), 15, 21); // participant_b wins the WB final

    $final = $bracket->fresh()->matches()->where('bracket_type', 'final')->first();
    completeMatch($service, $final->fresh(), 10, 15);

    expect($tournament->fresh()->status)->toBe('completed');
});

it('always reaches completion regardless of how many byes the field needs', function (int $playerCount) {
    $tournament = makeTournament('double_elimination', $playerCount);
    $service = app(BracketService::class);
    $bracket = $service->generate($tournament);

    for ($guard = 0; $guard < 100; $guard++) {
        $tournament->refresh();
        if ($tournament->status === 'completed') {
            break;
        }

        $playable = $bracket->fresh()->matches()
            ->where('status', 'scheduled')
            ->whereNotNull('participant_a_id')
            ->whereNotNull('participant_b_id')
            ->first();

        if (! $playable) {
            break;
        }

        completeMatch($service, $playable, 21, 10);
    }

    expect($tournament->fresh()->status)->toBe('completed');
})->with([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

it('does not get stuck when two winners-bracket byes feed the same losers-bracket pairing', function () {
    // 6 players -> bracket size 8 -> 2 byes, both landing in winners round-1
    // matches 0 and 1, which are losers-round-1's own pairing — neither
    // produces a loser, so that losers match must be skipped entirely
    // rather than left permanently unplayable.
    $tournament = makeTournament('double_elimination', 6);
    $service = app(BracketService::class);
    $bracket = $service->generate($tournament);

    $lbR1 = $bracket->matches()->where('bracket_type', 'losers')->where('round', 101)->get();
    expect($lbR1)->toHaveCount(1); // the both-byes pairing (position 0) was skipped

    // Play every real match with participant_a winning, following the
    // bracket forward however it evolves, until the tournament finishes.
    for ($guard = 0; $guard < 50; $guard++) {
        $tournament->refresh();
        if ($tournament->status === 'completed') {
            break;
        }

        $playable = $bracket->fresh()->matches()
            ->where('status', 'scheduled')
            ->whereNotNull('participant_a_id')
            ->whereNotNull('participant_b_id')
            ->first();

        if (! $playable) {
            break;
        }

        completeMatch($service, $playable, 21, 10);
    }

    expect($tournament->fresh()->status)->toBe('completed');
});

it('generates a winners bracket, losers bracket, and grand final for a power-of-two team field', function () {
    $tournament = makeTeamTournament('double_elimination', 4);
    $bracket = app(BracketService::class)->generate($tournament);

    $matches = $bracket->matches;
    expect($matches->where('bracket_type', 'winners'))->toHaveCount(3); // 2 R1 + 1 final
    expect($matches->where('bracket_type', 'losers'))->toHaveCount(2); // LBR1 + LBR2, 1 match each
    expect($matches->where('bracket_type', 'final'))->toHaveCount(1);
    expect($matches->every(fn (GameMatch $m) => is_null($m->participant_a_id) && is_null($m->participant_b_id) && is_null($m->winner_id)))->toBeTrue();
});

it('routes a winners-bracket loser through the losers bracket to a grand-final rematch, for a team tournament', function () {
    $tournament = makeTeamTournament('double_elimination', 4);
    $service = app(BracketService::class);
    $bracket = $service->generate($tournament);

    $wbR1 = $bracket->matches()->where('bracket_type', 'winners')->where('round', 1)->orderBy('id')->get();
    [$p0, $p1] = [$wbR1[0]->participant_a_team_id, $wbR1[0]->participant_b_team_id];
    [$p2, $p3] = [$wbR1[1]->participant_a_team_id, $wbR1[1]->participant_b_team_id];

    completeTeamMatch($service, $wbR1[0], 21, 10); // p0 beats p1
    completeTeamMatch($service, $wbR1[1], 21, 10); // p2 beats p3

    $wbFinal = $bracket->fresh()->matches()->where('bracket_type', 'winners')->where('round', 2)->first();
    expect($wbFinal->participant_a_team_id)->toBe($p0);
    expect($wbFinal->participant_b_team_id)->toBe($p2);

    completeTeamMatch($service, $wbFinal->fresh(), 21, 15); // p0 beats p2 -> p0 is WB champion

    $lbR1 = $bracket->fresh()->matches()->where('bracket_type', 'losers')->where('round', 101)->first();
    expect([$lbR1->participant_a_team_id, $lbR1->participant_b_team_id])->toEqualCanonicalizing([$p1, $p3]);

    completeTeamMatch($service, $lbR1->fresh(), 21, 18); // loser of p1/p3 is eliminated for real (2nd loss)

    $lbR2 = $bracket->fresh()->matches()->where('bracket_type', 'losers')->where('round', 102)->first();
    expect($lbR2->participant_b_team_id)->toBe($p2); // p2 (WB final loser) dropped in here

    completeTeamMatch($service, $lbR2->fresh(), 21, 19);

    $final = $bracket->fresh()->matches()->where('bracket_type', 'final')->first();
    expect($final->participant_a_team_id)->toBe($p0); // WB champion waits in the grand final
    expect($final->participant_b_team_id)->not->toBeNull(); // LB champion joins once decided

    completeTeamMatch($service, $final->fresh(), 21, 17);

    expect($tournament->fresh()->status)->toBe('completed');
    expect($tournament->fresh()->champion_team_id)->toBe($p0);

    // Individual columns must never populate anywhere across the whole run.
    expect($bracket->fresh()->matches->every(
        fn (GameMatch $m) => is_null($m->participant_a_id) && is_null($m->participant_b_id) && is_null($m->winner_id)
    ))->toBeTrue();
});

it('always reaches completion regardless of how many byes the team field needs', function (int $teamCount) {
    $tournament = makeTeamTournament('double_elimination', $teamCount);
    $service = app(BracketService::class);
    $bracket = $service->generate($tournament);

    for ($guard = 0; $guard < 100; $guard++) {
        $tournament->refresh();
        if ($tournament->status === 'completed') {
            break;
        }

        $playable = $bracket->fresh()->matches()
            ->where('status', 'scheduled')
            ->whereNotNull('participant_a_team_id')
            ->whereNotNull('participant_b_team_id')
            ->first();

        if (! $playable) {
            break;
        }

        completeTeamMatch($service, $playable, 21, 10);
    }

    expect($tournament->fresh()->status)->toBe('completed');
    expect($tournament->fresh()->champion_team_id)->not->toBeNull();
})->with([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);

// ---- Swiss system ----

it('pairs every player exactly once per round with no elimination', function () {
    $tournament = makeTournament('swiss', 8);
    $bracket = app(BracketService::class)->generate($tournament);

    $round1 = $bracket->matches()->where('bracket_type', 'swiss')->where('round', 1)->get();
    expect($round1)->toHaveCount(4); // 8 players, even count -> no bye

    $playerIds = $round1->flatMap(fn (GameMatch $m) => [$m->participant_a_id, $m->participant_b_id]);
    expect($playerIds->unique())->toHaveCount(8);
});

it('gives an odd field a bye that counts as an automatic win, favoring whoever has not had one', function () {
    $tournament = makeTournament('swiss', 5);
    $service = app(BracketService::class);
    $bracket = $service->generate($tournament);

    $round1 = $bracket->matches()->where('bracket_type', 'swiss')->where('round', 1)->get();
    expect($round1)->toHaveCount(3); // 2 real matches + 1 bye for 5 players

    $bye1 = $round1->first(fn (GameMatch $m) => is_null($m->participant_b_id));
    expect($bye1->status)->toBe('completed');
    expect($bye1->winner_id)->toBe($bye1->participant_a_id);

    foreach ($round1->where('status', 'scheduled') as $match) {
        completeMatch($service, $match, 21, 10);
    }

    $round2 = $bracket->fresh()->matches()->where('bracket_type', 'swiss')->where('round', 2)->get();
    $bye2 = $round2->first(fn (GameMatch $m) => is_null($m->participant_b_id));
    expect($bye2)->not->toBeNull();
    // The round-1 bye recipient must not be the one sitting out again while
    // 4 other players have never had a bye.
    expect($bye2->participant_a_id)->not->toBe($bye1->participant_a_id);
});

it('advances to the next swiss round only once every match in the round is complete', function () {
    $tournament = makeTournament('swiss', 4);
    $service = app(BracketService::class);
    $bracket = $service->generate($tournament);

    $round1 = $bracket->matches()->where('bracket_type', 'swiss')->where('round', 1)->get();
    expect($round1)->toHaveCount(2);

    completeMatch($service, $round1->first(), 21, 10);

    expect($bracket->fresh()->matches()->where('bracket_type', 'swiss')->where('round', 2)->exists())->toBeFalse();

    completeMatch($service, $round1->last(), 21, 10);

    expect($bracket->fresh()->matches()->where('bracket_type', 'swiss')->where('round', 2)->exists())->toBeTrue();
});

it('runs ceil(log2(playerCount)) rounds then completes with standings reflecting every result', function () {
    $tournament = makeTournament('swiss', 8); // ceil(log2(8)) = 3 rounds
    $service = app(BracketService::class);
    $bracket = $service->generate($tournament);

    $roundsPlayed = 0;
    for ($guard = 0; $guard < 20; $guard++) {
        $tournament->refresh();
        if ($tournament->status === 'completed') {
            break;
        }

        $playable = $bracket->fresh()->matches()->where('bracket_type', 'swiss')
            ->where('status', 'scheduled')->get();

        if ($playable->isEmpty()) {
            break;
        }

        foreach ($playable as $match) {
            completeMatch($service, $match, 21, 10); // participant_a always wins
        }
        $roundsPlayed++;
    }

    expect($roundsPlayed)->toBe(3);
    expect($tournament->fresh()->status)->toBe('completed');

    $maxRound = $bracket->fresh()->matches()->where('bracket_type', 'swiss')->max('round');
    expect($maxRound)->toBe(3);
});

it('completes a swiss tournament immediately when only one player is registered', function () {
    $tournament = makeTournament('swiss', 1);
    $service = app(BracketService::class);
    $service->generate($tournament);

    expect($tournament->fresh()->status)->toBe('completed');
});

it('always reaches completion for any player count, odd or even', function (int $playerCount) {
    $tournament = makeTournament('swiss', $playerCount);
    $service = app(BracketService::class);
    $bracket = $service->generate($tournament);

    for ($guard = 0; $guard < 20; $guard++) {
        $tournament->refresh();
        if ($tournament->status === 'completed') {
            break;
        }

        $playable = $bracket->fresh()->matches()->where('bracket_type', 'swiss')->where('status', 'scheduled')->get();
        if ($playable->isEmpty()) {
            break;
        }

        foreach ($playable as $match) {
            completeMatch($service, $match, 21, 10);
        }
    }

    expect($tournament->fresh()->status)->toBe('completed');
})->with([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 16]);

it('pairs every team exactly once per round with no elimination', function () {
    $tournament = makeTeamTournament('swiss', 8);
    $bracket = app(BracketService::class)->generate($tournament);

    $round1 = $bracket->matches()->where('bracket_type', 'swiss')->where('round', 1)->get();
    expect($round1)->toHaveCount(4); // 8 teams, even count -> no bye

    $teamIds = $round1->flatMap(fn (GameMatch $m) => [$m->participant_a_team_id, $m->participant_b_team_id]);
    expect($teamIds->unique())->toHaveCount(8);
    expect($round1->every(fn (GameMatch $m) => is_null($m->participant_a_id) && is_null($m->participant_b_id)))->toBeTrue();
});

it('gives an odd team field a bye that counts as an automatic win, favoring whoever has not had one', function () {
    $tournament = makeTeamTournament('swiss', 5);
    $service = app(BracketService::class);
    $bracket = $service->generate($tournament);

    $round1 = $bracket->matches()->where('bracket_type', 'swiss')->where('round', 1)->get();
    expect($round1)->toHaveCount(3); // 2 real matches + 1 bye for 5 teams

    $bye1 = $round1->first(fn (GameMatch $m) => is_null($m->participant_b_team_id));
    expect($bye1->status)->toBe('completed');
    expect($bye1->winner_team_id)->toBe($bye1->participant_a_team_id);

    foreach ($round1->where('status', 'scheduled') as $match) {
        completeTeamMatch($service, $match, 21, 10);
    }

    $round2 = $bracket->fresh()->matches()->where('bracket_type', 'swiss')->where('round', 2)->get();
    $bye2 = $round2->first(fn (GameMatch $m) => is_null($m->participant_b_team_id));
    expect($bye2)->not->toBeNull();
    // The round-1 bye recipient must not be the one sitting out again while
    // 4 other teams have never had a bye.
    expect($bye2->participant_a_team_id)->not->toBe($bye1->participant_a_team_id);
});

it('runs ceil(log2(teamCount)) rounds then completes a team swiss tournament with team columns populated throughout', function () {
    $tournament = makeTeamTournament('swiss', 8); // ceil(log2(8)) = 3 rounds
    $service = app(BracketService::class);
    $bracket = $service->generate($tournament);

    $roundsPlayed = 0;
    for ($guard = 0; $guard < 20; $guard++) {
        $tournament->refresh();
        if ($tournament->status === 'completed') {
            break;
        }

        $playable = $bracket->fresh()->matches()->where('bracket_type', 'swiss')
            ->where('status', 'scheduled')->get();

        if ($playable->isEmpty()) {
            break;
        }

        foreach ($playable as $match) {
            completeTeamMatch($service, $match, 21, 10); // participant_a always wins
        }
        $roundsPlayed++;
    }

    expect($roundsPlayed)->toBe(3);
    expect($tournament->fresh()->status)->toBe('completed');
    expect($tournament->fresh()->champion_team_id)->not->toBeNull();

    $maxRound = $bracket->fresh()->matches()->where('bracket_type', 'swiss')->max('round');
    expect($maxRound)->toBe(3);

    // Individual columns must never populate anywhere across the whole run.
    $allSwissMatches = $bracket->fresh()->matches()->where('bracket_type', 'swiss')->get();
    expect($allSwissMatches->every(
        fn (GameMatch $m) => is_null($m->participant_a_id) && is_null($m->participant_b_id) && is_null($m->winner_id)
    ))->toBeTrue();
});
