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

function playerStatTournament(Sport $sport, ?SportFormat $format, User $organizer, User $venueOrganizer, string $scoringType = 'single_score'): Tournament
{
    return Tournament::create([
        'organizer_id' => $organizer->id,
        'venue_organizer_id' => $venueOrganizer->id,
        'sport_id' => $sport->id,
        'sport_format_id' => $format?->id,
        'name' => 'Pentagon Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek(),
        'status' => 'ongoing',
        'scoring_type' => $scoringType,
        'sets_to_win' => 2,
    ]);
}

function playerStatTeamMatch(Tournament $tournament, Team $teamA, Team $teamB): GameMatch
{
    $bracket = Bracket::create(['tournament_id' => $tournament->id, 'structure' => [], 'current_round' => 1]);

    return GameMatch::create([
        'bracket_id' => $bracket->id,
        'round' => 1,
        'participant_a_team_id' => $teamA->id,
        'participant_b_team_id' => $teamB->id,
        'score_a' => 0,
        'score_b' => 0,
        'status' => 'scheduled',
    ]);
}

function playerStatIndividualMatch(Tournament $tournament, User $playerA, User $playerB): GameMatch
{
    $bracket = Bracket::create(['tournament_id' => $tournament->id, 'structure' => [], 'current_round' => 1]);

    return GameMatch::create([
        'bracket_id' => $bracket->id,
        'round' => 1,
        'participant_a_id' => $playerA->id,
        'participant_b_id' => $playerB->id,
        'score_a' => 0,
        'score_b' => 0,
        'status' => 'scheduled',
    ]);
}

function playerStatTeam(Sport $sport, ?SportFormat $format, User $captain, string $name): Team
{
    $team = Team::create([
        'sport_id' => $sport->id,
        'sport_format_id' => $format?->id,
        'captain_id' => $captain->id,
        'name' => $name,
        'status' => 'ready',
    ]);
    TeamMember::create(['team_id' => $team->id, 'user_id' => $captain->id, 'status' => 'accepted']);

    return $team;
}

it('upserts a player stat row on score save and updates it in place on a second save', function () {
    $sport = Sport::create(['name' => 'Basketball', 'category' => 'team']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => '5v5', 'players_per_side' => 5]);
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $coachA = userWithRole('coach');
    $coachB = userWithRole('coach');
    $tournament = playerStatTournament($sport, $format, $organizer, $venueOrganizer);
    $teamA = playerStatTeam($sport, $format, $coachA, 'Team A');
    $teamB = playerStatTeam($sport, $format, $coachB, 'Team B');
    $match = playerStatTeamMatch($tournament, $teamA, $teamB);

    $response = $this->actingAs($venueOrganizer)->patchJson("/api/matches/{$match->id}/score", [
        'score_a' => 2, 'score_b' => 0, 'status' => 'live',
        'player_stats' => [['user_id' => $coachA->id, 'stats' => ['points' => 2, 'rebounds' => 0]]],
    ]);
    $response->assertOk();
    $this->assertDatabaseHas('match_player_stats', ['match_id' => $match->id, 'user_id' => $coachA->id]);
    expect(MatchPlayerStat::where('match_id', $match->id)->where('user_id', $coachA->id)->first()->stats)
        ->toMatchArray(['points' => 2, 'rebounds' => 0]);

    $this->actingAs($venueOrganizer)->patchJson("/api/matches/{$match->id}/score", [
        'score_a' => 4, 'score_b' => 0, 'status' => 'live',
        'player_stats' => [['user_id' => $coachA->id, 'stats' => ['points' => 4, 'rebounds' => 1]]],
    ])->assertOk();

    $this->assertDatabaseCount('match_player_stats', 1);
    expect(MatchPlayerStat::first()->stats)->toMatchArray(['points' => 4, 'rebounds' => 1]);
});

it('upserts player stats through the best-of-sets score path too', function () {
    $sport = Sport::create(['name' => 'Volleyball', 'category' => 'team']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => '6v6', 'players_per_side' => 6]);
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $coachA = userWithRole('coach');
    $coachB = userWithRole('coach');
    $tournament = playerStatTournament($sport, $format, $organizer, $venueOrganizer, 'best_of_sets');
    $teamA = playerStatTeam($sport, $format, $coachA, 'Team A');
    $teamB = playerStatTeam($sport, $format, $coachB, 'Team B');
    $match = playerStatTeamMatch($tournament, $teamA, $teamB);

    $this->actingAs($venueOrganizer)->patchJson("/api/matches/{$match->id}/score", [
        'sets' => [['score_a' => 25, 'score_b' => 20]],
        'player_stats' => [['user_id' => $coachA->id, 'stats' => ['kills' => 5]]],
    ])->assertOk();

    $this->assertDatabaseHas('match_player_stats', ['match_id' => $match->id, 'user_id' => $coachA->id, 'sport_id' => $sport->id]);
});

it('always derives team_id server-side from real team membership, never from the client', function () {
    $sport = Sport::create(['name' => 'Basketball', 'category' => 'team']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => '5v5', 'players_per_side' => 5]);
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $coachA = userWithRole('coach');
    $coachB = userWithRole('coach');
    $tournament = playerStatTournament($sport, $format, $organizer, $venueOrganizer);
    $teamA = playerStatTeam($sport, $format, $coachA, 'Team A');
    $teamB = playerStatTeam($sport, $format, $coachB, 'Team B');
    $match = playerStatTeamMatch($tournament, $teamA, $teamB);

    // The validation rules never accept a client-sent team_id at all — this
    // request can't even attempt to spoof one, it's simply not a recognized field.
    $this->actingAs($venueOrganizer)->patchJson("/api/matches/{$match->id}/score", [
        'score_a' => 2, 'score_b' => 0, 'status' => 'live',
        'player_stats' => [['user_id' => $coachB->id, 'stats' => ['points' => 2]]],
    ])->assertOk();

    $this->assertDatabaseHas('match_player_stats', ['match_id' => $match->id, 'user_id' => $coachB->id, 'team_id' => $teamB->id]);
});

it('leaves team_id null for an individual (non-team) match', function () {
    $sport = Sport::create(['name' => 'Tennis', 'category' => 'racket']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => 'Singles', 'players_per_side' => 1]);
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $playerA = User::factory()->create();
    $playerB = User::factory()->create();
    $tournament = playerStatTournament($sport, null, $organizer, $venueOrganizer, 'best_of_sets');
    $match = playerStatIndividualMatch($tournament, $playerA, $playerB);

    $this->actingAs($venueOrganizer)->patchJson("/api/matches/{$match->id}/score", [
        'sets' => [['score_a' => 6, 'score_b' => 3]],
        'player_stats' => [['user_id' => $playerA->id, 'stats' => ['points_won' => 20]]],
    ])->assertOk();

    $this->assertDatabaseHas('match_player_stats', ['match_id' => $match->id, 'user_id' => $playerA->id, 'team_id' => null]);
});

it('denies score saves (and thus player stat writes) to a venue organizer not assigned to the match', function () {
    $sport = Sport::create(['name' => 'Basketball', 'category' => 'team']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => '5v5', 'players_per_side' => 5]);
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $stranger = userWithRole('venue_organizer');
    $coachA = userWithRole('coach');
    $coachB = userWithRole('coach');
    $tournament = playerStatTournament($sport, $format, $organizer, $venueOrganizer);
    $teamA = playerStatTeam($sport, $format, $coachA, 'Team A');
    $teamB = playerStatTeam($sport, $format, $coachB, 'Team B');
    $match = playerStatTeamMatch($tournament, $teamA, $teamB);

    $this->actingAs($stranger)->patchJson("/api/matches/{$match->id}/score", [
        'score_a' => 2, 'score_b' => 0, 'status' => 'live',
        'player_stats' => [['user_id' => $coachA->id, 'stats' => ['points' => 2]]],
    ])->assertStatus(403);

    $this->assertDatabaseCount('match_player_stats', 0);
});

it('sums a players career stats correctly across multiple completed matches and sports, excluding live ones', function () {
    // Badminton here (not Basketball) — Basketball's career totals are
    // derived rates computed by ProfileController::basketballCareerTotals(),
    // covered separately; this test is about the generic per-field-sum path
    // every other sport still uses.
    $badminton = Sport::create(['name' => 'Badminton', 'category' => 'racquet']);
    $bFormat = SportFormat::create(['sport_id' => $badminton->id, 'name' => 'Doubles', 'players_per_side' => 2]);
    $volleyball = Sport::create(['name' => 'Volleyball', 'category' => 'team']);
    $vFormat = SportFormat::create(['sport_id' => $volleyball->id, 'name' => '6v6', 'players_per_side' => 6]);
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $player = userWithRole('player');
    $opponentCoach = userWithRole('coach');

    // Two completed badminton matches for the same player.
    $bTournament1 = playerStatTournament($badminton, $bFormat, $organizer, $venueOrganizer);
    $teamA1 = playerStatTeam($badminton, $bFormat, $player, 'Squad 1');
    $teamB1 = playerStatTeam($badminton, $bFormat, $opponentCoach, 'Rivals 1');
    $match1 = playerStatTeamMatch($bTournament1, $teamA1, $teamB1);
    MatchPlayerStat::create(['match_id' => $match1->id, 'user_id' => $player->id, 'team_id' => $teamA1->id, 'sport_id' => $badminton->id, 'stats' => ['points_won' => 10, 'aces' => 3]]);
    $match1->update(['status' => 'completed']);

    $bTournament2 = playerStatTournament($badminton, $bFormat, $organizer, $venueOrganizer);
    $teamA2 = playerStatTeam($badminton, $bFormat, $player, 'Squad 2');
    $teamB2 = playerStatTeam($badminton, $bFormat, $opponentCoach, 'Rivals 2');
    $match2 = playerStatTeamMatch($bTournament2, $teamA2, $teamB2);
    MatchPlayerStat::create(['match_id' => $match2->id, 'user_id' => $player->id, 'team_id' => $teamA2->id, 'sport_id' => $badminton->id, 'stats' => ['points_won' => 8, 'aces' => 5]]);
    $match2->update(['status' => 'completed']);

    // A still-live badminton match — must be excluded from the sum.
    $bTournament3 = playerStatTournament($badminton, $bFormat, $organizer, $venueOrganizer);
    $teamA3 = playerStatTeam($badminton, $bFormat, $player, 'Squad 3');
    $teamB3 = playerStatTeam($badminton, $bFormat, $opponentCoach, 'Rivals 3');
    $match3 = playerStatTeamMatch($bTournament3, $teamA3, $teamB3);
    MatchPlayerStat::create(['match_id' => $match3->id, 'user_id' => $player->id, 'team_id' => $teamA3->id, 'sport_id' => $badminton->id, 'stats' => ['points_won' => 999]]);
    $match3->update(['status' => 'live']);

    // One completed volleyball match, different sport.
    $vTournament = playerStatTournament($volleyball, $vFormat, $organizer, $venueOrganizer);
    $vTeamA = playerStatTeam($volleyball, $vFormat, $player, 'Spikers');
    $vTeamB = playerStatTeam($volleyball, $vFormat, $opponentCoach, 'Blockers');
    $vMatch = playerStatTeamMatch($vTournament, $vTeamA, $vTeamB);
    MatchPlayerStat::create(['match_id' => $vMatch->id, 'user_id' => $player->id, 'team_id' => $vTeamA->id, 'sport_id' => $volleyball->id, 'stats' => ['kills' => 12]]);
    $vMatch->update(['status' => 'completed']);

    $response = $this->actingAs($player)->getJson("/api/social/users/{$player->id}/stat-summary");

    $response->assertOk();
    $data = collect($response->json('sports'));
    expect($data)->toHaveCount(2);

    $badmintonEntry = $data->firstWhere('sport_name', 'Badminton');
    expect($badmintonEntry['matches_played'])->toBe(2);
    expect($badmintonEntry['totals']['points_won'])->toBe(18);
    expect($badmintonEntry['totals']['aces'])->toBe(8);

    $volleyballEntry = $data->firstWhere('sport_name', 'Volleyball');
    expect($volleyballEntry['matches_played'])->toBe(1);
    expect($volleyballEntry['totals']['kills'])->toBe(12);
});

it('rolls up win/loss records per sport and overall, and lists full match history', function () {
    $basketball = Sport::create(['name' => 'Basketball', 'category' => 'team']);
    $bFormat = SportFormat::create(['sport_id' => $basketball->id, 'name' => '5v5', 'players_per_side' => 5]);
    $tennis = Sport::create(['name' => 'Tennis', 'category' => 'racket']);
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $player = userWithRole('player');
    $opponentCoach = userWithRole('coach');
    $opponentPlayer = User::factory()->create();

    // A won team match.
    $bTournament1 = playerStatTournament($basketball, $bFormat, $organizer, $venueOrganizer);
    $teamA1 = playerStatTeam($basketball, $bFormat, $player, 'Squad 1');
    $teamB1 = playerStatTeam($basketball, $bFormat, $opponentCoach, 'Rivals 1');
    $match1 = playerStatTeamMatch($bTournament1, $teamA1, $teamB1);
    MatchPlayerStat::create(['match_id' => $match1->id, 'user_id' => $player->id, 'team_id' => $teamA1->id, 'sport_id' => $basketball->id, 'stats' => ['points' => 10]]);
    $match1->update(['status' => 'completed', 'score_a' => 50, 'score_b' => 40, 'winner_team_id' => $teamA1->id]);

    // A lost team match, same sport.
    $bTournament2 = playerStatTournament($basketball, $bFormat, $organizer, $venueOrganizer);
    $teamA2 = playerStatTeam($basketball, $bFormat, $player, 'Squad 2');
    $teamB2 = playerStatTeam($basketball, $bFormat, $opponentCoach, 'Rivals 2');
    $match2 = playerStatTeamMatch($bTournament2, $teamA2, $teamB2);
    MatchPlayerStat::create(['match_id' => $match2->id, 'user_id' => $player->id, 'team_id' => $teamA2->id, 'sport_id' => $basketball->id, 'stats' => ['points' => 5]]);
    $match2->update(['status' => 'completed', 'score_a' => 30, 'score_b' => 45, 'winner_team_id' => $teamB2->id]);

    // A won individual match, different sport.
    $tTournament = playerStatTournament($tennis, null, $organizer, $venueOrganizer, 'best_of_sets');
    $tMatch = playerStatIndividualMatch($tTournament, $player, $opponentPlayer);
    MatchPlayerStat::create(['match_id' => $tMatch->id, 'user_id' => $player->id, 'team_id' => null, 'sport_id' => $tennis->id, 'stats' => ['points_won' => 40]]);
    $tMatch->update(['status' => 'completed', 'score_a' => 6, 'score_b' => 3, 'winner_id' => $player->id]);

    $response = $this->actingAs($player)->getJson("/api/social/users/{$player->id}/stat-summary")->assertOk();

    $basketballEntry = collect($response->json('sports'))->firstWhere('sport_name', 'Basketball');
    expect($basketballEntry['wins'])->toBe(1);
    expect($basketballEntry['losses'])->toBe(1);
    expect($basketballEntry['win_rate'])->toBe(50);

    $tennisEntry = collect($response->json('sports'))->firstWhere('sport_name', 'Tennis');
    expect($tennisEntry['wins'])->toBe(1);
    expect($tennisEntry['losses'])->toBe(0);
    expect($tennisEntry['win_rate'])->toBe(100);

    $response->assertJsonPath('overall.matches_played', 3);
    $response->assertJsonPath('overall.wins', 2);
    $response->assertJsonPath('overall.losses', 1);
    expect($response->json('overall.win_rate'))->toBe(66.7);
    expect($response->json('overall.by_sport'))->toHaveCount(2);

    $history = collect($response->json('history'));
    expect($history)->toHaveCount(3);
    expect($history->pluck('result')->sort()->values()->all())->toBe(['loss', 'win', 'win']);

    $wonBasketballGame = $history->firstWhere('match_id', $match1->id);
    expect($wonBasketballGame['result'])->toBe('win');
    expect($wonBasketballGame['opponent_name'])->toBe('Rivals 1');
    expect($wonBasketballGame['tournament_name'])->toBe('Pentagon Cup');
    expect($wonBasketballGame['score'])->toBe('50-40');

    $tennisGame = $history->firstWhere('match_id', $tMatch->id);
    expect($tennisGame['opponent_name'])->toBe($opponentPlayer->name);
});

it('404s the stat summary for a target user with neither the player nor coach role', function () {
    $organizer = userWithRole('organizer');
    $viewer = userWithRole('coach');

    $this->actingAs($viewer)->getJson("/api/social/users/{$organizer->id}/stat-summary")->assertStatus(404);
});
