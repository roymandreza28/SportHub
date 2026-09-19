<?php

use App\Models\Bracket;
use App\Models\GameMatch;
use App\Models\MatchEvent;
use App\Models\MatchPlayerStat;
use App\Models\Sport;
use App\Models\SportFormat;
use App\Models\Team;
use App\Models\TeamMember;
use App\Models\Tournament;
use App\Models\User;

function resultsExportTournament(User $organizer): Tournament
{
    $sport = Sport::firstOrCreate(['name' => 'Basketball'], ['category' => 'team']);

    return Tournament::create([
        'organizer_id' => $organizer->id,
        'sport_id' => $sport->id,
        'name' => 'Results Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek(),
        'status' => 'ongoing',
    ]);
}

it('exports a complete tournament report PDF including bracket results, per-player stats, and the match log', function () {
    $organizer = userWithRole('organizer');
    $tournament = resultsExportTournament($organizer);
    $sport = $tournament->sport;
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => '5v5', 'players_per_side' => 5]);

    $captainA = userWithRole('player');
    $captainA->update(['name' => 'Team A Captain']);
    $captainB = userWithRole('player');
    $captainB->update(['name' => 'Team B Captain']);

    $teamA = Team::create(['sport_id' => $sport->id, 'sport_format_id' => $format->id, 'captain_id' => $captainA->id, 'name' => 'Alpha Squad', 'status' => 'ready']);
    TeamMember::create(['team_id' => $teamA->id, 'user_id' => $captainA->id, 'status' => 'accepted']);
    $teamB = Team::create(['sport_id' => $sport->id, 'sport_format_id' => $format->id, 'captain_id' => $captainB->id, 'name' => 'Beta Squad', 'status' => 'ready']);
    TeamMember::create(['team_id' => $teamB->id, 'user_id' => $captainB->id, 'status' => 'accepted']);

    $bracket = Bracket::create(['tournament_id' => $tournament->id, 'structure' => [], 'current_round' => 1]);
    $match = GameMatch::create([
        'bracket_id' => $bracket->id,
        'round' => 1,
        'participant_a_team_id' => $teamA->id,
        'participant_b_team_id' => $teamB->id,
        'score_a' => 55,
        'score_b' => 48,
        'status' => 'completed',
        'winner_team_id' => $teamA->id,
    ]);

    MatchPlayerStat::create([
        'match_id' => $match->id, 'user_id' => $captainA->id, 'team_id' => $teamA->id, 'sport_id' => $sport->id,
        'stats' => ['points' => 22, 'rebounds' => 8],
    ]);
    MatchPlayerStat::create([
        'match_id' => $match->id, 'user_id' => $captainB->id, 'team_id' => $teamB->id, 'sport_id' => $sport->id,
        'stats' => ['points' => 15, 'rebounds' => 4],
    ]);

    MatchEvent::create([
        'match_id' => $match->id, 'type' => 'point',
        'payload' => ['score_a' => 55, 'score_b' => 48, 'period_label' => 'Q4'],
    ]);

    $response = $this->actingAs($organizer)->get("/api/tournaments/{$tournament->id}/results/export");

    $response->assertOk();
    $response->assertHeader('content-type', 'application/pdf');
    expect($response->getContent())->toStartWith('%PDF');
    expect(strlen($response->getContent()))->toBeGreaterThan(1000);
});

it('builds report data for an individual-match using the participant directly, not a team', function () {
    $organizer = userWithRole('organizer');
    $tournament = resultsExportTournament($organizer);

    $playerA = userWithRole('player');
    $playerA->update(['name' => 'Solo Player A']);
    $playerB = userWithRole('player');
    $playerB->update(['name' => 'Solo Player B']);

    $bracket = Bracket::create(['tournament_id' => $tournament->id, 'structure' => [], 'current_round' => 1]);
    $match = GameMatch::create([
        'bracket_id' => $bracket->id,
        'round' => 1,
        'participant_a_id' => $playerA->id,
        'participant_b_id' => $playerB->id,
        'score_a' => 21,
        'score_b' => 15,
        'status' => 'completed',
        'winner_id' => $playerA->id,
    ]);

    MatchPlayerStat::create([
        'match_id' => $match->id, 'user_id' => $playerA->id, 'team_id' => null, 'sport_id' => $tournament->sport_id,
        'stats' => ['points' => 21],
    ]);

    $response = $this->actingAs($organizer)->get("/api/tournaments/{$tournament->id}/results/export");

    $response->assertOk();
    expect($response->getContent())->toStartWith('%PDF');
});

it('ranks individual players by the sport primary stat even in a team-sport tournament', function () {
    $organizer = userWithRole('organizer');
    $tournament = resultsExportTournament($organizer);
    $sport = $tournament->sport;
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => '5v5', 'players_per_side' => 5]);

    $topScorer = userWithRole('player');
    $topScorer->update(['name' => 'Top Scorer']);
    $secondScorer = userWithRole('player');
    $secondScorer->update(['name' => 'Second Scorer']);
    $opponent = userWithRole('player');
    $opponent->update(['name' => 'Opponent Player']);

    $teamA = Team::create(['sport_id' => $sport->id, 'sport_format_id' => $format->id, 'captain_id' => $topScorer->id, 'name' => 'Home Team', 'status' => 'ready']);
    TeamMember::create(['team_id' => $teamA->id, 'user_id' => $topScorer->id, 'status' => 'accepted']);
    TeamMember::create(['team_id' => $teamA->id, 'user_id' => $secondScorer->id, 'status' => 'accepted']);
    $teamB = Team::create(['sport_id' => $sport->id, 'sport_format_id' => $format->id, 'captain_id' => $opponent->id, 'name' => 'Away Team', 'status' => 'ready']);
    TeamMember::create(['team_id' => $teamB->id, 'user_id' => $opponent->id, 'status' => 'accepted']);

    $bracket = Bracket::create(['tournament_id' => $tournament->id, 'structure' => [], 'current_round' => 1]);

    // Two matches so games-played and per-game averaging both have real data.
    $match1 = GameMatch::create([
        'bracket_id' => $bracket->id, 'round' => 1,
        'participant_a_team_id' => $teamA->id, 'participant_b_team_id' => $teamB->id,
        'score_a' => 60, 'score_b' => 50, 'status' => 'completed', 'winner_team_id' => $teamA->id,
    ]);
    $match2 = GameMatch::create([
        'bracket_id' => $bracket->id, 'round' => 2,
        'participant_a_team_id' => $teamA->id, 'participant_b_team_id' => $teamB->id,
        'score_a' => 58, 'score_b' => 52, 'status' => 'completed', 'winner_team_id' => $teamA->id,
    ]);

    foreach ([$match1, $match2] as $match) {
        MatchPlayerStat::create(['match_id' => $match->id, 'user_id' => $topScorer->id, 'team_id' => $teamA->id, 'sport_id' => $sport->id, 'stats' => ['points' => 30]]);
        MatchPlayerStat::create(['match_id' => $match->id, 'user_id' => $secondScorer->id, 'team_id' => $teamA->id, 'sport_id' => $sport->id, 'stats' => ['points' => 10]]);
        MatchPlayerStat::create(['match_id' => $match->id, 'user_id' => $opponent->id, 'team_id' => $teamB->id, 'sport_id' => $sport->id, 'stats' => ['points' => 20]]);
    }

    $response = $this->actingAs($organizer)->get("/api/tournaments/{$tournament->id}/rankings/export");

    $response->assertOk();
    $csv = $response->streamedContent();

    $lines = array_values(array_filter(explode("\n", trim($csv))));
    expect($lines[0])->toContain('Rank');
    expect($lines[0])->toContain('Ranked By');
    expect($lines[0])->toContain('Points (Total)');

    // Rank 1 must be the top scorer (60 total points across 2 games), not
    // whichever team won — proving the ranking is per-player, not per-team.
    expect($lines[1])->toContain('Top Scorer')->toContain('Home Team');
    expect($lines[2])->toContain('Opponent Player')->toContain('Away Team');
    expect($lines[3])->toContain('Second Scorer')->toContain('Home Team');
    expect(str_starts_with($lines[1], '1,'))->toBeTrue();
    expect(str_starts_with($lines[2], '2,'))->toBeTrue();
    expect(str_starts_with($lines[3], '3,'))->toBeTrue();
});

it('builds a rowspan bracket tree that keeps every box vertically centered over the matches that feed it', function () {
    $organizer = userWithRole('organizer');
    $tournament = resultsExportTournament($organizer);

    $players = collect(['Alpha', 'Bravo', 'Charlie', 'Delta'])->map(function ($name) {
        $p = userWithRole('player');
        $p->update(['name' => $name]);

        return $p;
    });

    $bracket = Bracket::create(['tournament_id' => $tournament->id, 'structure' => [], 'current_round' => 1]);
    GameMatch::create([
        'bracket_id' => $bracket->id, 'round' => 1,
        'participant_a_id' => $players[0]->id, 'participant_b_id' => $players[1]->id,
        'score_a' => 21, 'score_b' => 10, 'status' => 'completed', 'winner_id' => $players[0]->id,
    ]);
    GameMatch::create([
        'bracket_id' => $bracket->id, 'round' => 1,
        'participant_a_id' => $players[2]->id, 'participant_b_id' => $players[3]->id,
        'score_a' => 15, 'score_b' => 21, 'status' => 'completed', 'winner_id' => $players[3]->id,
    ]);
    GameMatch::create([
        'bracket_id' => $bracket->id, 'round' => 2,
        'participant_a_id' => $players[0]->id, 'participant_b_id' => $players[3]->id,
        'status' => 'scheduled',
    ]);

    $matches = $bracket->matches()
        ->with(['participantA:id,name', 'participantB:id,name', 'participantATeam:id,name', 'participantBTeam:id,name'])
        ->orderBy('round')->orderBy('id')->get();

    $controller = new App\Http\Controllers\TournamentController;
    $buildTree = new ReflectionMethod($controller, 'buildEliminationTree');
    $buildTree->setAccessible(true);
    $tree = $buildTree->invoke($controller, $matches);

    // 2 rounds of a 4-player bracket, labeled Semifinal/Final rather than
    // generic "Round 1"/"Round 2".
    expect($tree['labels'][0]['text'])->toBe('Semifinal');
    expect($tree['labels'][1]['text'])->toBe('Final');

    $sf0 = $tree['boxes'][0];
    $sf1 = $tree['boxes'][1];
    $final = $tree['boxes'][2];

    expect($sf0)->toMatchArray(['name_a' => 'Alpha', 'name_b' => 'Bravo', 'winner_side' => 'a']);
    expect($sf1)->toMatchArray(['name_a' => 'Charlie', 'name_b' => 'Delta', 'winner_side' => 'b']);

    // The final box must show the two semifinal winners — not the original
    // entrants — as not-yet-decided (winner_side null, scores hidden since
    // it's still scheduled), and be vertically centered exactly between the
    // two semifinal boxes' own centers (proving the connector lines drawn
    // from those Y-coordinates will actually meet this box, not overshoot
    // or undershoot it).
    expect($final)->toMatchArray([
        'name_a' => 'Alpha', 'name_b' => 'Delta', 'score_a' => null, 'score_b' => null, 'winner_side' => null,
    ]);
    expect($final['center_y'])->toBe(($sf0['center_y'] + $sf1['center_y']) / 2);
    // The final round sits one full column to the right of the semifinal
    // round, and both boxes share the same fixed width.
    expect($final['x'])->toBe($sf0['x'] + $tree['box_width'] + 40);

    // The connector SVG must actually contain a stroked path reaching from
    // the semifinal boxes' right edge into the final box's left edge — not
    // just correct box coordinates with nothing drawn between them.
    $svg = base64_decode(str_replace('data:image/svg+xml;base64,', '', $tree['connector_image']));
    expect($svg)->toContain('M '.($sf0['x'] + $tree['box_width']).' '.$sf0['center_y']);
    expect($svg)->toContain('L '.$final['x'].' '.$final['center_y']);
});

it('builds a double-elimination tree with a real generated bracket, connecting winners-bracket losers into the losers bracket and both finalists into the grand final', function () {
    $organizer = userWithRole('organizer');
    $sport = Sport::firstOrCreate(['name' => 'Basketball'], ['category' => 'team']);
    $tournament = Tournament::create([
        'organizer_id' => $organizer->id, 'sport_id' => $sport->id, 'name' => 'DE Cup',
        'format' => 'double_elimination', 'starts_at' => now()->addWeek(), 'status' => 'registration',
    ]);

    $players = collect(range(1, 4))->map(function ($i) {
        $p = userWithRole('player');
        $p->update(['name' => "Player $i"]);

        return $p;
    });
    foreach ($players as $p) {
        $tournament->registrations()->create(['user_id' => $p->id, 'status' => 'confirmed']);
    }

    app(App\Services\BracketService::class)->generate($tournament);

    $matches = $tournament->bracket->matches()
        ->with(['participantA:id,name', 'participantB:id,name', 'participantATeam:id,name', 'participantBTeam:id,name'])
        ->orderBy('round')->orderBy('id')->get();

    $controller = new App\Http\Controllers\TournamentController;
    $buildTree = new ReflectionMethod($controller, 'buildDoubleEliminationTree');
    $buildTree->setAccessible(true);
    $tree = $buildTree->invoke($controller, $matches);

    // A 4-player double-elimination bracket is exactly: 2 WB round-1
    // matches + 1 WB final, 1 LB round + 1 LB final, and 1 grand final —
    // every one of those 6 matches must have a box in the tree.
    expect(count($tree['boxes']))->toBe(6);
    expect(collect($tree['labels'])->pluck('text')->all())->toEqual([
        'Winners Bracket', 'Semifinal', 'WB Final', 'Losers Bracket', 'LB Round 1', 'LB Final', 'Grand Final',
    ]);

    $wbR1Matches = $matches->where('bracket_type', 'winners')->where('round', 1)->values();
    $lbMatch = $matches->where('bracket_type', 'losers')->first();
    $finalMatch = $matches->firstWhere('bracket_type', 'final');

    $boxByMatchId = collect($tree['boxes'])->keyBy('match_id');
    $svg = base64_decode(str_replace('data:image/svg+xml;base64,', '', $tree['connector_image']));

    // Both WB round-1 losers must have a DASHED connector into the single
    // LB round-1 match (the "both R1 losers pair up directly" rule).
    $lbBox = $boxByMatchId[$lbMatch->id];
    foreach ($wbR1Matches as $wbMatch) {
        $fromBox = $boxByMatchId[$wbMatch->id];
        $path = 'M '.($fromBox['x'] + $tree['box_width']).' '.$fromBox['center_y'];
        expect($svg)->toContain($path);
    }
    expect($svg)->toContain('stroke-dasharray');
    expect($svg)->toContain('#fbbf24');

    // The grand final box must exist and sit to the right of everything
    // else, and its connector paths must originate from BOTH the WB final
    // and the LB final (the two finalists), landing on the grand final's
    // own left edge.
    $finalBox = $boxByMatchId[$finalMatch->id];
    expect($finalBox['x'])->toBeGreaterThan($lbBox['x']);
    expect($svg)->toContain('L '.$finalBox['x'].' '.$finalBox['center_y']);
});

it('lays round_robin matches out in plain round columns with no connector lines', function () {
    $organizer = userWithRole('organizer');
    $sport = Sport::firstOrCreate(['name' => 'Basketball'], ['category' => 'team']);
    $tournament = Tournament::create([
        'organizer_id' => $organizer->id, 'sport_id' => $sport->id, 'name' => 'RR Cup',
        'format' => 'round_robin', 'starts_at' => now()->addWeek(), 'status' => 'registration',
    ]);

    $players = collect(range(1, 4))->map(function ($i) {
        $p = userWithRole('player');
        $p->update(['name' => "Player $i"]);

        return $p;
    });
    foreach ($players as $p) {
        $tournament->registrations()->create(['user_id' => $p->id, 'status' => 'confirmed']);
    }

    app(App\Services\BracketService::class)->generate($tournament);

    $matches = $tournament->bracket->matches()
        ->with(['participantA:id,name', 'participantB:id,name', 'participantATeam:id,name', 'participantBTeam:id,name'])
        ->orderBy('round')->orderBy('id')->get();

    $controller = new App\Http\Controllers\TournamentController;
    $buildLayout = new ReflectionMethod($controller, 'buildRoundRobinLayout');
    $buildLayout->setAccessible(true);
    $tree = $buildLayout->invoke($controller, $matches);

    // 4 players round-robin -> 3 rounds of 2 matches each, every match gets
    // a box, and — unlike every other format — no connector lines at all
    // (round_robin has no bracket to advance through).
    expect(count($tree['boxes']))->toBe($matches->count());
    expect(collect($tree['labels'])->pluck('text')->all())->toEqual(['Round 1', 'Round 2', 'Round 3']);

    $svg = base64_decode(str_replace('data:image/svg+xml;base64,', '', $tree['connector_image']));
    expect($svg)->not->toContain('<path');
});

it('groups swiss matches into record buckets that update round-to-round, and traces each player\'s previous match', function () {
    $organizer = userWithRole('organizer');
    $tournament = resultsExportTournament($organizer);

    $players = collect(['P1', 'P2', 'P3', 'P4'])->map(function ($name) {
        $p = userWithRole('player');
        $p->update(['name' => $name]);

        return $p;
    });

    $bracket = Bracket::create(['tournament_id' => $tournament->id, 'structure' => [], 'current_round' => 1]);

    $r1m1 = GameMatch::create([
        'bracket_id' => $bracket->id, 'round' => 1, 'bracket_type' => 'swiss',
        'participant_a_id' => $players[0]->id, 'participant_b_id' => $players[1]->id,
        'score_a' => 21, 'score_b' => 10, 'status' => 'completed', 'winner_id' => $players[0]->id,
    ]);
    $r1m2 = GameMatch::create([
        'bracket_id' => $bracket->id, 'round' => 1, 'bracket_type' => 'swiss',
        'participant_a_id' => $players[2]->id, 'participant_b_id' => $players[3]->id,
        'score_a' => 21, 'score_b' => 15, 'status' => 'completed', 'winner_id' => $players[2]->id,
    ]);
    // Round 2 pairs the two round-1 winners (P1 vs P3) and the two round-1
    // losers (P2 vs P4) — real Swiss pairing behavior, though this test
    // only needs the record bookkeeping downstream of it to be right.
    $r2m1 = GameMatch::create([
        'bracket_id' => $bracket->id, 'round' => 2, 'bracket_type' => 'swiss',
        'participant_a_id' => $players[0]->id, 'participant_b_id' => $players[2]->id,
        'status' => 'scheduled',
    ]);
    $r2m2 = GameMatch::create([
        'bracket_id' => $bracket->id, 'round' => 2, 'bracket_type' => 'swiss',
        'participant_a_id' => $players[1]->id, 'participant_b_id' => $players[3]->id,
        'status' => 'scheduled',
    ]);

    $matches = $bracket->matches()
        ->with(['participantA:id,name', 'participantB:id,name', 'participantATeam:id,name', 'participantBTeam:id,name'])
        ->orderBy('round')->orderBy('id')->get();

    $controller = new App\Http\Controllers\TournamentController;
    $buildTree = new ReflectionMethod($controller, 'buildSwissTree');
    $buildTree->setAccessible(true);
    $tree = $buildTree->invoke($controller, $matches);

    // Round 1 has no history yet, so its one bucket is "0-0". Round 2 MUST
    // show the real carried-over records ("1-0" for the two undefeated
    // winners, "0-1" for the two winless losers) — not "0-0" again, which
    // is exactly the bug a `fn` arrow function's by-VALUE capture of
    // $record caused (it kept reading the empty pre-loop array forever).
    $labelsByRound = collect($tree['labels'])->groupBy(fn ($l) => $l['x']);
    $round1Labels = $labelsByRound->get(0)->pluck('text')->all();
    $round2Labels = $labelsByRound->values()[1]->pluck('text')->all();

    expect($round1Labels)->toContain('0-0');
    expect($round2Labels)->toContain('1-0');
    expect($round2Labels)->toContain('0-1');
    expect($round2Labels)->not->toContain('0-0');

    // Both round-2 matches must have an incoming connector from EACH
    // player's own round-1 match (P1's from r1m1, P3's also from r1m1 —
    // r2m1 pairs them, so it gets two lines both originating at r1m1's box;
    // r2m2 similarly gets two lines both from r1m2's box).
    $boxByMatchId = collect($tree['boxes'])->keyBy('match_id');
    $svg = base64_decode(str_replace('data:image/svg+xml;base64,', '', $tree['connector_image']));

    $fromR1M1 = $boxByMatchId[$r1m1->id];
    $fromR1M2 = $boxByMatchId[$r1m2->id];
    $toR2M1 = $boxByMatchId[$r2m1->id];
    $toR2M2 = $boxByMatchId[$r2m2->id];

    expect($svg)->toContain('M '.($fromR1M1['x'] + $tree['box_width']).' '.$fromR1M1['center_y']);
    expect($svg)->toContain('L '.$toR2M1['x'].' '.$toR2M1['center_y']);
    expect($svg)->toContain('M '.($fromR1M2['x'] + $tree['box_width']).' '.$fromR1M2['center_y']);
    expect($svg)->toContain('L '.$toR2M2['x'].' '.$toR2M2['center_y']);
});

it('ranks group_stage standings the same way BracketService::rankGroup() decides real qualifiers (wins, then score differential, then total scored)', function () {
    $organizer = userWithRole('organizer');
    $tournament = resultsExportTournament($organizer);

    $players = collect(['Top Seed', 'Second Seed', 'Tiebreak Winner', 'Tiebreak Loser'])->map(function ($name) {
        $p = userWithRole('player');
        $p->update(['name' => $name]);

        return $p;
    });

    $bracket = Bracket::create(['tournament_id' => $tournament->id, 'structure' => [], 'current_round' => 1]);

    // Group 0: Top Seed beats Second Seed outright — one match settles it.
    GameMatch::create([
        'bracket_id' => $bracket->id, 'round' => 1, 'group_number' => 0,
        'participant_a_id' => $players[0]->id, 'participant_b_id' => $players[1]->id,
        'score_a' => 21, 'score_b' => 5, 'status' => 'completed', 'winner_id' => $players[0]->id,
    ]);

    // Group 1: both players go 1-1 against each other in a two-leg
    // group (allowed — group_stage doesn't forbid a rematch) — same win
    // count, so the ranking MUST fall through to score differential:
    // Tiebreak Winner scored more across both legs despite the tied
    // win count.
    GameMatch::create([
        'bracket_id' => $bracket->id, 'round' => 1, 'group_number' => 1,
        'participant_a_id' => $players[2]->id, 'participant_b_id' => $players[3]->id,
        'score_a' => 21, 'score_b' => 18, 'status' => 'completed', 'winner_id' => $players[2]->id,
    ]);
    GameMatch::create([
        'bracket_id' => $bracket->id, 'round' => 2, 'group_number' => 1,
        'participant_a_id' => $players[3]->id, 'participant_b_id' => $players[2]->id,
        'score_a' => 21, 'score_b' => 19, 'status' => 'completed', 'winner_id' => $players[3]->id,
    ]);

    $matches = $bracket->matches()
        ->with(['participantA:id,name', 'participantB:id,name', 'participantATeam:id,name', 'participantBTeam:id,name'])
        ->orderBy('round')->orderBy('id')->get();

    $controller = new App\Http\Controllers\TournamentController;
    $compute = new ReflectionMethod($controller, 'computeGroupStandingsForReport');
    $compute->setAccessible(true);
    $groups = $compute->invoke($controller, $matches->whereNotNull('group_number'));

    expect($groups)->toHaveCount(2);
    expect($groups[0])->toMatchArray(['label' => 'Group A', 'advance_count' => 2]);
    expect($groups[0]['standings'][0])->toMatchArray(['name' => 'Top Seed', 'wins' => 1]);
    expect($groups[0]['standings'][1])->toMatchArray(['name' => 'Second Seed', 'wins' => 0]);

    expect($groups[1]['label'])->toBe('Group B');
    // Both players are 1-1, so total scored (21+19=40 vs 18+21=39) must be
    // what actually decides first place — not win count, which is tied.
    expect($groups[1]['standings'][0])->toMatchArray(['name' => 'Tiebreak Winner', 'wins' => 1, 'for' => 40]);
    expect($groups[1]['standings'][1])->toMatchArray(['name' => 'Tiebreak Loser', 'wins' => 1, 'for' => 39]);
});

it('denies exporting results/rankings to an organizer who does not own the tournament', function () {
    $owner = userWithRole('organizer');
    $tournament = resultsExportTournament($owner);
    $otherOrganizer = userWithRole('organizer');

    $this->actingAs($otherOrganizer)->get("/api/tournaments/{$tournament->id}/results/export")->assertForbidden();
    $this->actingAs($otherOrganizer)->get("/api/tournaments/{$tournament->id}/rankings/export")->assertForbidden();
});
