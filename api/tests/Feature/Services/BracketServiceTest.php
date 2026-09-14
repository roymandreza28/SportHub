<?php

use App\Models\GameMatch;
use App\Models\Sport;
use App\Models\SportFormat;
use App\Models\Team;
use App\Models\Tournament;
use App\Models\TournamentRegistration;
use App\Models\User;
use App\Services\BracketService;

/** Order-independent key for an unordered pair of participant ids. */
function pairKey(int $a, int $b): string
{
    $ids = [$a, $b];
    sort($ids);

    return implode('-', $ids);
}

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

it('generates a real circle-method round-robin schedule with no byes', function () {
    $tournament = makeTournament('round_robin', 4);
    $bracket = app(BracketService::class)->generate($tournament);

    // 4 players -> N-1 = 3 real rounds of 2 matches each (nobody plays twice
    // in the same round), C(4,2) = 6 matches total, every pair exactly once.
    $matches = $bracket->matches;
    expect($matches)->toHaveCount(6);
    expect($matches->pluck('round')->unique()->sort()->values()->all())->toBe([1, 2, 3]);
    expect($matches->every(fn (GameMatch $m) => $m->participant_a_id && $m->participant_b_id))->toBeTrue();

    foreach ($matches->groupBy('round') as $roundMatches) {
        expect($roundMatches)->toHaveCount(2);
        $playersInRound = $roundMatches->flatMap(fn (GameMatch $m) => [$m->participant_a_id, $m->participant_b_id]);
        expect($playersInRound->unique())->toHaveCount(4);
    }

    $pairs = $matches->map(fn (GameMatch $m) => collect([$m->participant_a_id, $m->participant_b_id])->sort()->values()->all())->unique();
    expect($pairs)->toHaveCount(6);
});

it('generates a real circle-method round-robin schedule with team columns set and no byes, for a team tournament', function () {
    $tournament = makeTeamTournament('round_robin', 4);
    $bracket = app(BracketService::class)->generate($tournament);

    // 4 teams -> N-1 = 3 real rounds of 2 matches each, C(4,2) = 6 matches
    // total, every pair exactly once.
    $matches = $bracket->matches;
    expect($matches)->toHaveCount(6);
    expect($matches->pluck('round')->unique()->sort()->values()->all())->toBe([1, 2, 3]);
    expect($matches->every(fn (GameMatch $m) => $m->participant_a_team_id && $m->participant_b_team_id))->toBeTrue();
    expect($matches->every(fn (GameMatch $m) => is_null($m->participant_a_id) && is_null($m->participant_b_id)))->toBeTrue();

    foreach ($matches->groupBy('round') as $roundMatches) {
        expect($roundMatches)->toHaveCount(2);
        $teamsInRound = $roundMatches->flatMap(fn (GameMatch $m) => [$m->participant_a_team_id, $m->participant_b_team_id]);
        expect($teamsInRound->unique())->toHaveCount(4);
    }

    $pairs = $matches->map(fn (GameMatch $m) => collect([$m->participant_a_team_id, $m->participant_b_team_id])->sort()->values()->all())->unique();
    expect($pairs)->toHaveCount(6);
});

it('gives every player exactly one bye round in an odd-numbered round robin', function () {
    $tournament = makeTournament('round_robin', 5);
    $bracket = app(BracketService::class)->generate($tournament);

    // 5 players -> padded to 6 slots -> 5 real rounds, one bye per round
    // (2 matches instead of the even-count's usual floor(6/2)=3, since one
    // slot per round is the bye and produces no match), 5 players x 1 bye
    // each = 5 total byes across the schedule, C(5,2)=10 matches.
    $matches = $bracket->matches;
    expect($matches)->toHaveCount(10);
    expect($matches->pluck('round')->unique()->sort()->values()->all())->toBe([1, 2, 3, 4, 5]);

    foreach ($matches->groupBy('round') as $roundMatches) {
        expect($roundMatches)->toHaveCount(2);
    }

    $pairs = $matches->map(fn (GameMatch $m) => collect([$m->participant_a_id, $m->participant_b_id])->sort()->values()->all())->unique();
    expect($pairs)->toHaveCount(10);

    // Every one of the 5 players sat out exactly one round (5 rounds x 4
    // playing players = 20 player-slots filled, 25 possible - 20 = 5 sit-outs,
    // one per player).
    $playerIds = $tournament->registrations()->pluck('user_id');
    foreach ($playerIds as $playerId) {
        $appearances = $matches->filter(fn (GameMatch $m) => $m->participant_a_id === $playerId || $m->participant_b_id === $playerId)->count();
        expect($appearances)->toBe(4); // plays every other of the 4 remaining players once
    }
});

it('records a completed round-robin matchs winner in the bracket structure snapshot, not just the match row', function () {
    // Regression: round_robin has no bracket to advance (it's just a
    // standings table), but advanceWinner() used to return before ever
    // rebuilding bracket.structure for this format — the match row itself
    // got its winner_id set correctly, but the cached structure snapshot
    // the frontend actually renders from stayed frozen at generation time,
    // so a completed match's winner never actually showed up anywhere.
    $tournament = makeTournament('round_robin', 4);
    $service = app(BracketService::class);
    $bracket = $service->generate($tournament);

    $match = $bracket->matches->first();
    completeMatch($service, $match, 21, 10);

    $structureMatch = collect($bracket->fresh()->structure)->flatten(1)->firstWhere('id', $match->id);
    expect($structureMatch['status'])->toBe('completed');
    expect($structureMatch['winner_id'])->toBe($match->participant_a_id);
    expect($structureMatch['winner']['id'])->toBe($match->participant_a_id);
});

it('crowns a champion once every round-robin fixture is played', function () {
    $tournament = makeTournament('round_robin', 4);
    $service = app(BracketService::class);
    $bracket = $service->generate($tournament);

    expect($tournament->fresh()->status)->not->toBe('completed');

    foreach ($bracket->matches as $match) {
        completeMatch($service, $match, 21, 10); // participant_a always wins
    }

    expect($tournament->fresh()->status)->toBe('completed');
    expect($tournament->fresh()->champion_id)->not->toBeNull();
});

it('breaks a round-robin tie by highest total score across the whole schedule, not an arbitrary order', function () {
    $tournament = makeTournament('round_robin', 4);
    $service = app(BracketService::class);
    $bracket = $service->generate($tournament);

    $ids = $tournament->registrations()->pluck('user_id')->values()->all();
    [$p1, $p2, $p3, $p4] = $ids;

    // p1 and p2 both finish 2-1 (tied on wins) — p1 scores 70 total across
    // its 3 games, p2 scores only 45, so p1 must be crowned champion over
    // p2 despite the identical win count.
    $results = [
        pairKey($p1, $p2) => [$p2 => 20, $p1 => 10], // p2 beats p1
        pairKey($p1, $p3) => [$p1 => 30, $p3 => 10], // p1 beats p3
        pairKey($p1, $p4) => [$p1 => 30, $p4 => 10], // p1 beats p4
        pairKey($p2, $p3) => [$p2 => 15, $p3 => 10], // p2 beats p3
        pairKey($p2, $p4) => [$p4 => 25, $p2 => 10], // p4 beats p2
        pairKey($p3, $p4) => [$p3 => 20, $p4 => 15], // p3 beats p4
    ];

    foreach ($bracket->matches as $match) {
        $scores = $results[pairKey($match->participant_a_id, $match->participant_b_id)];
        completeMatch($service, $match, $scores[$match->participant_a_id], $scores[$match->participant_b_id]);
    }

    expect($tournament->fresh()->status)->toBe('completed');
    expect($tournament->fresh()->champion_id)->toBe($p1);
});

it('breaks a round-robin tie using real per-set points, not sets won, for a best-of-sets tournament', function () {
    $tournament = makeTournament('round_robin', 4);
    $tournament->update(['scoring_type' => 'best_of_sets', 'sets_to_win' => 2]);
    $service = app(BracketService::class);
    $bracket = $service->generate($tournament);

    $ids = $tournament->registrations()->pluck('user_id')->values()->all();
    [$p1, $p2, $p3, $p4] = $ids;

    // p1 and p2 both finish 2-1 (tied on wins). Under the OLD (buggy)
    // tiebreak — summing score_a/score_b, which for a best-of-sets match
    // are SETS WON, not points — p2 would win: p1 is swept 0-2 by p2 (0
    // sets won there), while p2 at least takes one set off p4 before
    // losing (1 set won there), giving p2 one more "won set" overall than
    // p1 (5 vs 4). But p1's real point totals across every set played are
    // far higher (big, high-scoring wins over p3/p4 and a close loss to
    // p2, vs. p2's low-scoring, low-margin wins), so the fixed tiebreak —
    // summing real per-set points from $match->sets — must crown p1
    // instead.
    $setsByPair = [
        pairKey($p1, $p3) => [[$p1 => 25, $p3 => 5], [$p1 => 25, $p3 => 5]], // p1 wins 2-0
        pairKey($p1, $p4) => [[$p1 => 25, $p4 => 5], [$p1 => 25, $p4 => 5]], // p1 wins 2-0
        pairKey($p1, $p2) => [[$p1 => 19, $p2 => 21], [$p1 => 19, $p2 => 21]], // p2 wins 2-0, close sets
        pairKey($p2, $p3) => [[$p2 => 3, $p3 => 1], [$p2 => 3, $p3 => 1]], // p2 wins 2-0, low-margin
        pairKey($p2, $p4) => [[$p2 => 3, $p4 => 1], [$p2 => 1, $p4 => 3], [$p2 => 1, $p4 => 3]], // p4 wins 2-1
        pairKey($p3, $p4) => [[$p3 => 21, $p4 => 15], [$p3 => 21, $p4 => 15]], // p3 wins 2-0
    ];

    foreach ($bracket->matches as $match) {
        $key = pairKey($match->participant_a_id, $match->participant_b_id);
        $sets = collect($setsByPair[$key])->map(fn ($set) => [
            'score_a' => $set[$match->participant_a_id],
            'score_b' => $set[$match->participant_b_id],
        ])->all();

        $setsWonA = collect($sets)->filter(fn ($s) => $s['score_a'] > $s['score_b'])->count();
        $setsWonB = collect($sets)->filter(fn ($s) => $s['score_b'] > $s['score_a'])->count();
        $winnerId = $setsWonA > $setsWonB ? $match->participant_a_id : $match->participant_b_id;

        $match->update([
            'sets' => $sets,
            'score_a' => $setsWonA,
            'score_b' => $setsWonB,
            'status' => 'completed',
            'winner_id' => $winnerId,
        ]);
        $service->advanceWinner($match->fresh());
    }

    expect($tournament->fresh()->status)->toBe('completed');
    expect($tournament->fresh()->champion_id)->toBe($p1);
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

    $byGroup = $matches->groupBy('group_number');
    expect($byGroup)->toHaveCount(3); // ceil(9/4) = 3 groups

    // 9 players across 3 groups deals to sizes 3/3/3 -> C(3,2)=3 matches each,
    // each group's own circle-method schedule padding 3 players to 4 slots
    // -> 3 real rounds, one real match per round (the 4th "player" is a bye).
    foreach ($byGroup as $groupMatches) {
        expect($groupMatches)->toHaveCount(3);
        expect($groupMatches->pluck('round')->unique()->sort()->values()->all())->toBe([1, 2, 3]);
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
    // 2 groups -> top 2 each -> 4 qualifiers -> single elimination bracket of
    // 2 rounds, starting the round right after the group phase's own last
    // real round (4-player groups get a real 3-round circle-method schedule
    // now, not just round 1 — see maybeStartGroupKnockout()'s own
    // max('round')+1 starting point).
    $maxGroupRound = $groupMatches->max('round');
    expect($knockoutMatches)->toHaveCount(3);
    expect($knockoutMatches->where('round', $maxGroupRound + 1))->toHaveCount(2);
    expect($knockoutMatches->where('round', $maxGroupRound + 2))->toHaveCount(1);
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
    // 2 groups -> top 2 each -> 4 qualifiers -> single elimination bracket of
    // 2 rounds, starting right after the group phase's own last real round.
    $maxGroupRound = $groupMatches->max('round');
    expect($knockoutMatches)->toHaveCount(3);
    expect($knockoutMatches->where('round', $maxGroupRound + 1))->toHaveCount(2);
    expect($knockoutMatches->where('round', $maxGroupRound + 2))->toHaveCount(1);
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

it('credits a draw as half a point for next-round pairing, not the same as a loss', function () {
    // Regression: swissStandings() used to only increment a plain integer
    // 'wins' counter, so a completed-but-tied match (equal scores, no
    // winner) contributed nothing to either side — indistinguishable from
    // an outright loss. That meant a player who drew a strong opponent
    // could get paired against round 1's actual loser in round 2, instead
    // of against another ~0.5-point player as Swiss pairing intends.
    $tournament = makeTournament('swiss', 4);
    $service = app(BracketService::class);
    $bracket = $service->generate($tournament);

    $round1 = $bracket->matches()->where('bracket_type', 'swiss')->where('round', 1)->get();
    expect($round1)->toHaveCount(2);

    // First match: decisive (a real winner and a real loser). Second match:
    // a draw (equal scores -> completeMatch() derives winner_id as null).
    completeMatch($service, $round1[0], 21, 10);
    completeMatch($service, $round1[1], 15, 15);

    $winnerId = $round1[0]->fresh()->winner_id;
    $loserId = $round1[0]->fresh()->participant_a_id === $winnerId
        ? $round1[0]->fresh()->participant_b_id
        : $round1[0]->fresh()->participant_a_id;
    $drawnIds = [$round1[1]->fresh()->participant_a_id, $round1[1]->fresh()->participant_b_id];

    $round2 = $bracket->fresh()->matches()->where('bracket_type', 'swiss')->where('round', 2)->first();
    expect($round2)->not->toBeNull();

    // Round 1's winner (1.0 point) must be paired with one of the two
    // drawn players (0.5 points each) in round 2, not with round 1's
    // outright loser (0 points) — a fresh opponent (the drawn players)
    // exists, so this is never a forced rematch either way.
    $round2Ids = [$round2->participant_a_id, $round2->participant_b_id];
    expect($round2Ids)->toContain($winnerId);
    expect($round2Ids)->not->toContain($loserId);
    expect(array_intersect($round2Ids, $drawnIds))->not->toBeEmpty();
});

it('finds a fresh opponent anywhere in the pool instead of settling for one adjacent swap', function () {
    // Regression: the old pairing loop only tried swapping with the very
    // next player in line when an adjacent pairing had already happened —
    // if that swap partner had ALSO already played the top player, it gave
    // up and paired them anyway. The reference greedy algorithm searches
    // the whole remaining pool, so a fresh opponent gets found whenever one
    // exists at all, however far down the list it is.
    $tournament = makeTournament('swiss', 8);
    $service = app(BracketService::class);
    $bracket = $service->generate($tournament);

    // Play every round but the last with the exact same score every time —
    // ties every player's win count, so round-to-round pairing is
    // driven purely by "who hasn't played whom yet", the scenario this
    // fix targets. If a decisive-scoring format ever forced a preventable
    // rematch, it would show up as a repeated pair across these rounds.
    // Exactly the mathematical minimum (ceil(log2(8)) = 3), not
    // BracketService's own totalSwissRounds() — that now runs one round
    // beyond the minimum for a more reliable ranking (see its own doc
    // comment), which for a field this size can legitimately force one
    // repeat pairing once every fresh option in the tier is exhausted; that
    // extra-round tradeoff is exercised by its own test elsewhere. This
    // test isolates the actual regression it targets: within the
    // mathematically-guaranteed-clean minimum, zero repeats should ever
    // happen.
    $totalRounds = (int) ceil(log(8, 2));
    for ($round = 1; $round <= $totalRounds; $round++) {
        $matches = $bracket->fresh()->matches()->where('bracket_type', 'swiss')->where('round', $round)->get();
        foreach ($matches as $match) {
            completeMatch($service, $match, 21, 10);
        }
    }

    $allMatches = $bracket->fresh()->matches()->where('bracket_type', 'swiss')->whereIn('round', range(1, $totalRounds))->get();
    $pairKeys = $allMatches->map(function (GameMatch $m) {
        $ids = [$m->participant_a_id, $m->participant_b_id];
        sort($ids);

        return implode('-', $ids);
    });

    // 8 players is exactly enough that every one of these 3 rounds should
    // find a genuinely fresh opponent for everyone — no pair should repeat
    // within the minimum schedule.
    expect($pairKeys)->toHaveCount($pairKeys->unique()->count());
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

it('runs one round beyond ceil(log2(playerCount)) then completes with standings reflecting every result', function () {
    $tournament = makeTournament('swiss', 8); // ceil(log2(8)) = 3, +1 reliability round = 4
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

    expect($roundsPlayed)->toBe(4);
    expect($tournament->fresh()->status)->toBe('completed');

    $maxRound = $bracket->fresh()->matches()->where('bracket_type', 'swiss')->max('round');
    expect($maxRound)->toBe(4);
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

it('runs one round beyond ceil(log2(teamCount)) then completes a team swiss tournament with team columns populated throughout', function () {
    $tournament = makeTeamTournament('swiss', 8); // ceil(log2(8)) = 3, +1 reliability round = 4
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

    expect($roundsPlayed)->toBe(4);
    expect($tournament->fresh()->status)->toBe('completed');
    expect($tournament->fresh()->champion_team_id)->not->toBeNull();

    $maxRound = $bracket->fresh()->matches()->where('bracket_type', 'swiss')->max('round');
    expect($maxRound)->toBe(4);

    // Individual columns must never populate anywhere across the whole run.
    $allSwissMatches = $bracket->fresh()->matches()->where('bracket_type', 'swiss')->get();
    expect($allSwissMatches->every(
        fn (GameMatch $m) => is_null($m->participant_a_id) && is_null($m->participant_b_id) && is_null($m->winner_id)
    ))->toBeTrue();
});
