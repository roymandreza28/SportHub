<?php

use App\Models\Bracket;
use App\Models\GameMatch;
use App\Models\MatchPlayerStat;
use App\Models\MatchStatSheet;
use App\Models\Sport;
use App\Models\SportFormat;
use App\Models\Team;
use App\Models\TeamMember;
use App\Models\Tournament;
use App\Models\User;

function basketballCareerMatch(Sport $sport, SportFormat $format, User $organizer, User $venueOrganizer, User $player, User $opponentCoach): array
{
    $tournament = Tournament::create([
        'organizer_id' => $organizer->id, 'venue_organizer_id' => $venueOrganizer->id, 'sport_id' => $sport->id,
        'sport_format_id' => $format->id, 'name' => 'Career Cup', 'format' => 'single_elimination',
        'starts_at' => now(), 'status' => 'ongoing', 'scoring_type' => 'single_score',
    ]);
    $teamA = Team::create(['sport_id' => $sport->id, 'sport_format_id' => $format->id, 'captain_id' => $player->id, 'name' => 'Squad', 'status' => 'ready']);
    TeamMember::create(['team_id' => $teamA->id, 'user_id' => $player->id, 'status' => 'accepted']);
    $teamB = Team::create(['sport_id' => $sport->id, 'sport_format_id' => $format->id, 'captain_id' => $opponentCoach->id, 'name' => 'Rivals', 'status' => 'ready']);
    $bracket = Bracket::create(['tournament_id' => $tournament->id, 'structure' => [], 'current_round' => 1]);
    $match = GameMatch::create([
        'bracket_id' => $bracket->id, 'round' => 1,
        'participant_a_team_id' => $teamA->id, 'participant_b_team_id' => $teamB->id,
        'score_a' => 0, 'score_b' => 0, 'status' => 'scheduled',
    ]);

    return compact('tournament', 'teamA', 'teamB', 'match');
}

// Basketball's career pentagon is derived (shooting %, per-game rates),
// merging the organizer-tracked made-shot/foul counts (MatchPlayerStat)
// with the coach's stat sheet (attempts, rebound split, assists/steals/
// blocks/turnovers) — this exercises that merge across two completed games.
it('derives shooting percentage and per-game rates from MatchPlayerStat + the coach stat sheet', function () {
    $sport = Sport::create(['name' => 'Basketball', 'category' => 'team']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => '5v5', 'players_per_side' => 5]);
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $player = userWithRole('player');
    $opponentCoach = userWithRole('coach');

    // Game 1: 4/6 2PT, 2/4 3PT, 3/4 FT = 9 made / 14 attempted. 5 reb, 3 ast, 2 stl, 1 blk, 2 TO, 3 PF.
    ['teamA' => $teamA1, 'match' => $match1] = basketballCareerMatch($sport, $format, $organizer, $venueOrganizer, $player, $opponentCoach);
    MatchPlayerStat::create([
        'match_id' => $match1->id, 'user_id' => $player->id, 'team_id' => $teamA1->id, 'sport_id' => $sport->id,
        'stats' => ['points' => 17, 'rebounds' => 5, 'fouls' => 3, 'ft_made' => 3, 'fg2_made' => 4, 'fg3_made' => 2],
    ]);
    MatchStatSheet::create([
        'match_id' => $match1->id, 'team_id' => $teamA1->id, 'sport_id' => $sport->id, 'is_locked' => true, 'locked_at' => now(),
        'data' => ['rows' => [[
            'player_id' => $player->id, 'name' => $player->name, 'jersey_number' => '1', 'notes' => '',
            'stats' => ['fg2_att' => 6, 'fg2_made' => 4, 'fg3_att' => 4, 'fg3_made' => 2, 'ft_att' => 4, 'ft_made' => 3, 'reb_off' => 2, 'reb_def' => 3, 'assists' => 3, 'steals' => 2, 'blocks' => 1, 'turnovers' => 2, 'fouls' => 3],
        ]], 'further_comments' => null, 'recorded_by' => null, 'signed' => null],
    ]);
    $match1->update(['status' => 'completed', 'winner_team_id' => $teamA1->id]);

    // Game 2: no stat sheet at all — only the organizer-tracked subset
    // exists (fouls/made-shot counts still count; attempts/reb/ast/stl/blk/
    // TO contribute nothing for this game since no coach filled it in).
    ['teamA' => $teamA2, 'match' => $match2] = basketballCareerMatch($sport, $format, $organizer, $venueOrganizer, $player, $opponentCoach);
    MatchPlayerStat::create([
        'match_id' => $match2->id, 'user_id' => $player->id, 'team_id' => $teamA2->id, 'sport_id' => $sport->id,
        'stats' => ['points' => 4, 'rebounds' => 0, 'fouls' => 1, 'ft_made' => 0, 'fg2_made' => 2, 'fg3_made' => 0],
    ]);
    $match2->update(['status' => 'completed', 'winner_team_id' => $teamA2->id]);

    $response = $this->actingAs($player)->getJson("/api/social/users/{$player->id}/stat-summary")->assertOk();
    $entry = collect($response->json('sports'))->firstWhere('sport_name', 'Basketball');

    expect($entry['matches_played'])->toBe(2);
    // Totals across both games: made = (4+2+3)+(2+0+0) = 11, attempted = 14+0 = 14.
    expect($entry['totals']['shooting_pct'])->toEqual(round(11 / 14 * 100, 1));
    // Rebounds: game 1 has 5 (2+3), game 2 has 0 (no sheet) -> 5/2 games.
    expect($entry['totals']['rebounds_per_game'])->toEqual(round(5 / 2, 1));
    expect($entry['totals']['assists_per_game'])->toEqual(round(3 / 2, 1));
    expect($entry['totals']['steals_per_game'])->toEqual(round(2 / 2, 1));
    expect($entry['totals']['blocks_per_game'])->toEqual(round(1 / 2, 1));
    expect($entry['totals']['turnovers_per_game'])->toEqual(round(2 / 2, 1));
    // Fouls always come from MatchPlayerStat regardless of a stat sheet: 3 + 1 = 4 across 2 games.
    expect($entry['totals']['fouls_per_game'])->toEqual(round(4 / 2, 1));

    $fieldKeys = collect($entry['pentagon_fields'])->pluck('key')->all();
    expect($fieldKeys)->toBe(['shooting_pct', 'rebounds_per_game', 'assists_per_game', 'steals_per_game', 'blocks_per_game', 'turnovers_per_game', 'fouls_per_game']);
});

it('reports a zero shooting percentage rather than dividing by zero when no shots are on record at all', function () {
    $sport = Sport::create(['name' => 'Basketball', 'category' => 'team']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => '5v5', 'players_per_side' => 5]);
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $player = userWithRole('player');
    $opponentCoach = userWithRole('coach');

    ['teamA' => $teamA, 'match' => $match] = basketballCareerMatch($sport, $format, $organizer, $venueOrganizer, $player, $opponentCoach);
    MatchPlayerStat::create([
        'match_id' => $match->id, 'user_id' => $player->id, 'team_id' => $teamA->id, 'sport_id' => $sport->id,
        'stats' => ['points' => 0, 'rebounds' => 0, 'fouls' => 0, 'ft_made' => 0, 'fg2_made' => 0, 'fg3_made' => 0],
    ]);
    $match->update(['status' => 'completed', 'winner_team_id' => $teamA->id]);

    $response = $this->actingAs($player)->getJson("/api/social/users/{$player->id}/stat-summary")->assertOk();
    $entry = collect($response->json('sports'))->firstWhere('sport_name', 'Basketball');

    expect($entry['totals']['shooting_pct'])->toBe(0);
});
