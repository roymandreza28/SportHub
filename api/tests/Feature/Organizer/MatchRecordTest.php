<?php

use App\Models\Bracket;
use App\Models\GameMatch;
use App\Models\MatchStatSheet;
use App\Models\Sport;
use App\Models\SportFormat;
use App\Models\Team;
use App\Models\Tournament;
use App\Models\User;

function recordTestMatch(string $status = 'completed'): array
{
    $organizer = userWithRole('organizer');
    $sport = Sport::create(['name' => 'Basketball', 'category' => 'team']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => '5v5', 'players_per_side' => 5]);
    $coachA = userWithRole('coach');
    $coachB = userWithRole('coach');
    $teamA = Team::create(['sport_id' => $sport->id, 'sport_format_id' => $format->id, 'captain_id' => $coachA->id, 'name' => 'Team A', 'status' => 'ready']);
    $teamB = Team::create(['sport_id' => $sport->id, 'sport_format_id' => $format->id, 'captain_id' => $coachB->id, 'name' => 'Team B', 'status' => 'ready']);

    $tournament = Tournament::create([
        'organizer_id' => $organizer->id, 'sport_id' => $sport->id, 'sport_format_id' => $format->id,
        'name' => 'Record Cup', 'format' => 'single_elimination', 'starts_at' => now(), 'status' => 'ongoing',
    ]);
    $bracket = Bracket::create(['tournament_id' => $tournament->id, 'structure' => [], 'current_round' => 1]);
    $match = GameMatch::create([
        'bracket_id' => $bracket->id, 'round' => 1,
        'participant_a_team_id' => $teamA->id, 'participant_b_team_id' => $teamB->id,
        'score_a' => 50, 'score_b' => 40, 'status' => $status,
        'winner_team_id' => $status === 'completed' ? $teamA->id : null,
    ]);

    return compact('match', 'teamA', 'teamB');
}

it('includes the full coach stat sheet per team for a completed match', function () {
    ['match' => $match, 'teamA' => $teamA] = recordTestMatch();

    MatchStatSheet::create([
        'match_id' => $match->id, 'team_id' => $teamA->id, 'sport_id' => $match->bracket->tournament->sport_id,
        'is_locked' => true, 'locked_at' => now(),
        'data' => ['rows' => [['player_id' => 1, 'name' => 'Test Player', 'jersey_number' => '7', 'notes' => '', 'stats' => ['fg2_made' => 5]]], 'further_comments' => null, 'recorded_by' => 'Coach A', 'signed' => 'Coach A'],
    ]);

    $response = $this->getJson("/api/matches/{$match->id}/record")->assertOk();

    $sheets = $response->json('stat_sheets');
    expect($sheets)->toHaveCount(1);
    expect($sheets[0]['participant_name'])->toBe($teamA->name);
    expect($sheets[0]['mode'])->toBe('roster');
    expect($sheets[0]['data']['rows'][0]['stats']['fg2_made'])->toBe(5);
    expect($sheets[0]['data']['recorded_by'])->toBe('Coach A');
});

it('omits stat sheets for a match that is not yet completed', function () {
    ['match' => $match, 'teamA' => $teamA] = recordTestMatch(status: 'live');

    MatchStatSheet::create([
        'match_id' => $match->id, 'team_id' => $teamA->id, 'sport_id' => $match->bracket->tournament->sport_id,
        'is_locked' => false, 'data' => ['rows' => [], 'further_comments' => null, 'recorded_by' => null, 'signed' => null],
    ]);

    $response = $this->getJson("/api/matches/{$match->id}/record")->assertOk();

    expect($response->json('stat_sheets'))->toBe([]);
});

it('reports an empty stat_sheets array for a completed match with no stat sheet on record', function () {
    ['match' => $match] = recordTestMatch();

    $response = $this->getJson("/api/matches/{$match->id}/record")->assertOk();

    expect($response->json('stat_sheets'))->toBe([]);
});

it('is publicly accessible without authentication, same as the rest of the match record', function () {
    ['match' => $match] = recordTestMatch();

    $this->getJson("/api/matches/{$match->id}/record")->assertOk();
});
