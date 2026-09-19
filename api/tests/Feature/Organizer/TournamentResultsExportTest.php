<?php

use App\Models\Bracket;
use App\Models\GameMatch;
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

it('exports a complete match-by-match results CSV including per-player stats on both sides', function () {
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

    $response = $this->actingAs($organizer)->get("/api/tournaments/{$tournament->id}/results/export");

    $response->assertOk();
    $response->assertHeader('content-type', 'text/csv; charset=UTF-8');

    $csv = $response->streamedContent();
    expect($csv)->toContain('Side A Player Stats');
    expect($csv)->toContain('Side B Player Stats');
    expect($csv)->toContain('Alpha Squad');
    expect($csv)->toContain('Beta Squad');
    expect($csv)->toContain('55');
    expect($csv)->toContain('48');
    expect($csv)->toContain('Team A Captain: Points=22, Rebounds=8');
    expect($csv)->toContain('Team B Captain: Points=15, Rebounds=4');
});

it('exports an individual-match row using the participant directly, not a team', function () {
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

    $csv = $this->actingAs($organizer)
        ->get("/api/tournaments/{$tournament->id}/results/export")
        ->streamedContent();

    expect($csv)->toContain('Solo Player A');
    expect($csv)->toContain('Solo Player B');
    expect($csv)->toContain('Points=21');
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

it('denies exporting results/rankings to an organizer who does not own the tournament', function () {
    $owner = userWithRole('organizer');
    $tournament = resultsExportTournament($owner);
    $otherOrganizer = userWithRole('organizer');

    $this->actingAs($otherOrganizer)->get("/api/tournaments/{$tournament->id}/results/export")->assertForbidden();
    $this->actingAs($otherOrganizer)->get("/api/tournaments/{$tournament->id}/rankings/export")->assertForbidden();
});
