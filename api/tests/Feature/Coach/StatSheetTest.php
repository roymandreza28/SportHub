<?php

use App\Models\Bracket;
use App\Models\GameMatch;
use App\Models\MatchStatSheet;
use App\Models\Sport;
use App\Models\SportFormat;
use App\Models\Team;
use App\Models\TeamMember;
use App\Models\Tournament;
use App\Models\TournamentRegistration;
use App\Models\User;

function statSheetTournament(Sport $sport, ?SportFormat $format, User $organizer, User $venueOrganizer, string $name = 'Cup', string $scoringType = 'single_score'): Tournament
{
    return Tournament::create([
        'organizer_id' => $organizer->id,
        'venue_organizer_id' => $venueOrganizer->id,
        'sport_id' => $sport->id,
        'sport_format_id' => $format?->id,
        'name' => $name,
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek(),
        'status' => 'ongoing',
        'scoring_type' => $scoringType,
        'sets_to_win' => 2,
    ]);
}

function statSheetTeamWithCaptain(Sport $sport, SportFormat $format, User $captain, string $name): Team
{
    $team = Team::create([
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'captain_id' => $captain->id,
        'name' => $name,
        'status' => 'ready',
    ]);
    TeamMember::create(['team_id' => $team->id, 'user_id' => User::factory()->create()->id, 'status' => 'accepted']);

    return $team;
}

function statSheetTeamMatch(Tournament $tournament, Team $teamA, Team $teamB, string $status = 'scheduled'): GameMatch
{
    $bracket = Bracket::create(['tournament_id' => $tournament->id, 'structure' => [], 'current_round' => 1]);

    return GameMatch::create([
        'bracket_id' => $bracket->id,
        'round' => 1,
        'participant_a_team_id' => $teamA->id,
        'participant_b_team_id' => $teamB->id,
        'score_a' => 0,
        'score_b' => 0,
        'status' => $status,
        'scheduled_at' => now()->addMinutes(5),
    ]);
}

function statSheetIndividualMatch(Tournament $tournament, User $playerA, User $playerB, string $status = 'scheduled'): GameMatch
{
    $bracket = Bracket::create(['tournament_id' => $tournament->id, 'structure' => [], 'current_round' => 1]);

    return GameMatch::create([
        'bracket_id' => $bracket->id,
        'round' => 1,
        'participant_a_id' => $playerA->id,
        'participant_b_id' => $playerB->id,
        'score_a' => 0,
        'score_b' => 0,
        'status' => $status,
        'scheduled_at' => now()->addMinutes(5),
    ]);
}

function statSheetBasketballSetup(): array
{
    $sport = Sport::create(['name' => 'Basketball', 'category' => 'team']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => '5v5', 'players_per_side' => 5]);
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $coachA = userWithRole('coach');
    $coachB = userWithRole('coach');

    $tournament = statSheetTournament($sport, $format, $organizer, $venueOrganizer, 'Hoops Cup');
    $teamA = statSheetTeamWithCaptain($sport, $format, $coachA, 'Team A');
    $teamB = statSheetTeamWithCaptain($sport, $format, $coachB, 'Team B');
    $match = statSheetTeamMatch($tournament, $teamA, $teamB);

    return compact('sport', 'format', 'organizer', 'venueOrganizer', 'coachA', 'coachB', 'tournament', 'teamA', 'teamB', 'match');
}

it('lazily creates a roster-mode stat sheet pre-filled with the accepted roster on first view', function () {
    $ctx = statSheetBasketballSetup();

    $response = $this->actingAs($ctx['coachA'])->getJson("/api/matches/{$ctx['match']->id}/stat-sheet");

    $response->assertOk();
    expect($response->json('mode'))->toBe('roster');
    expect($response->json('participant_name'))->toBe('Team A');
    expect($response->json('data.rows'))->toHaveCount(1);
    expect($response->json('data.rows.0.stats.fg2_att'))->toBe(0);
    $this->assertDatabaseCount('match_stat_sheets', 1);

    $this->actingAs($ctx['coachA'])->getJson("/api/matches/{$ctx['match']->id}/stat-sheet")->assertOk();
    $this->assertDatabaseCount('match_stat_sheets', 1);
});

it('gives each team captain only their own stat sheet, never the opponents', function () {
    $ctx = statSheetBasketballSetup();

    $responseA = $this->actingAs($ctx['coachA'])->getJson("/api/matches/{$ctx['match']->id}/stat-sheet");
    $responseB = $this->actingAs($ctx['coachB'])->getJson("/api/matches/{$ctx['match']->id}/stat-sheet");

    expect($responseA->json('participant_name'))->toBe('Team A');
    expect($responseB->json('participant_name'))->toBe('Team B');
    $this->assertDatabaseCount('match_stat_sheets', 2);
});

it('denies stat sheet access to a coach unrelated to either team', function () {
    $ctx = statSheetBasketballSetup();
    $stranger = userWithRole('coach');

    $this->actingAs($stranger)->getJson("/api/matches/{$ctx['match']->id}/stat-sheet")->assertStatus(403);
});

it('denies stat sheet access for a sport with no configured field set', function () {
    $sport = Sport::create(['name' => 'Chess', 'category' => 'other']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => 'Standard', 'players_per_side' => 1]);
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $coach = userWithRole('coach');
    $playerA = User::factory()->create();
    $playerB = User::factory()->create();

    $tournament = statSheetTournament($sport, $format, $organizer, $venueOrganizer, 'Chess Cup');
    TournamentRegistration::create(['tournament_id' => $tournament->id, 'user_id' => $playerA->id, 'registered_by' => $coach->id, 'status' => 'confirmed']);
    $match = statSheetIndividualMatch($tournament, $playerA, $playerB);

    $this->actingAs($coach)->getJson("/api/matches/{$match->id}/stat-sheet")->assertStatus(403);
});

it('saves roster-mode stat sheet edits and records who filled them in', function () {
    $ctx = statSheetBasketballSetup();

    $show = $this->actingAs($ctx['coachA'])->getJson("/api/matches/{$ctx['match']->id}/stat-sheet")->json();
    $rows = $show['data']['rows'];
    $rows[0]['stats']['fg2_made'] = 4;
    $rows[0]['stats']['fg2_att'] = 6;

    $response = $this->actingAs($ctx['coachA'])->patchJson("/api/matches/{$ctx['match']->id}/stat-sheet", [
        'data' => ['rows' => $rows, 'further_comments' => 'Great hustle', 'recorded_by' => 'Coach A', 'signed' => 'Coach A'],
    ]);

    $response->assertOk();
    expect($response->json('data.rows.0.stats.fg2_made'))->toBe(4);
    $this->assertDatabaseHas('match_stat_sheets', ['match_id' => $ctx['match']->id, 'team_id' => $ctx['teamA']->id, 'filled_by_user_id' => $ctx['coachA']->id]);
});

it('blocks editing once the venue organizer completes the match', function () {
    $ctx = statSheetBasketballSetup();
    $this->actingAs($ctx['coachA'])->getJson("/api/matches/{$ctx['match']->id}/stat-sheet");

    $this->actingAs($ctx['venueOrganizer'])->patchJson("/api/matches/{$ctx['match']->id}/score", [
        'score_a' => 50, 'score_b' => 40, 'status' => 'completed',
    ])->assertOk();

    $rows = $this->actingAs($ctx['coachA'])->getJson("/api/matches/{$ctx['match']->id}/stat-sheet")->json('data.rows');

    $this->actingAs($ctx['coachA'])->patchJson("/api/matches/{$ctx['match']->id}/stat-sheet", [
        'data' => ['rows' => $rows, 'further_comments' => null, 'recorded_by' => null, 'signed' => null],
    ])->assertStatus(422);
});

it('locks existing stat sheets when the match completes via updateScore', function () {
    $ctx = statSheetBasketballSetup();
    $this->actingAs($ctx['coachA'])->getJson("/api/matches/{$ctx['match']->id}/stat-sheet");
    $this->actingAs($ctx['coachB'])->getJson("/api/matches/{$ctx['match']->id}/stat-sheet");

    $this->actingAs($ctx['venueOrganizer'])->patchJson("/api/matches/{$ctx['match']->id}/score", [
        'score_a' => 50, 'score_b' => 40, 'status' => 'completed',
    ])->assertOk();

    $this->assertDatabaseHas('match_stat_sheets', ['match_id' => $ctx['match']->id, 'team_id' => $ctx['teamA']->id, 'is_locked' => true]);
    $this->assertDatabaseHas('match_stat_sheets', ['match_id' => $ctx['match']->id, 'team_id' => $ctx['teamB']->id, 'is_locked' => true]);
    expect(MatchStatSheet::first()->locked_at)->not->toBeNull();
});

it('reports a sheet created after the match already completed as locked', function () {
    $ctx = statSheetBasketballSetup();

    $this->actingAs($ctx['venueOrganizer'])->patchJson("/api/matches/{$ctx['match']->id}/score", [
        'score_a' => 50, 'score_b' => 40, 'status' => 'completed',
    ])->assertOk();

    $response = $this->actingAs($ctx['coachA'])->getJson("/api/matches/{$ctx['match']->id}/stat-sheet");

    $response->assertOk();
    expect($response->json('is_locked'))->toBeTrue();
});

it('supports roster mode for a second team sport (Volleyball), not just Basketball', function () {
    $sport = Sport::create(['name' => 'Volleyball', 'category' => 'team']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => '6v6', 'players_per_side' => 6]);
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $coach = userWithRole('coach');
    $tournament = statSheetTournament($sport, $format, $organizer, $venueOrganizer, 'Spike Cup');
    $teamA = statSheetTeamWithCaptain($sport, $format, $coach, 'Spikers');
    $teamB = statSheetTeamWithCaptain($sport, $format, userWithRole('coach'), 'Blockers');
    $match = statSheetTeamMatch($tournament, $teamA, $teamB);

    $response = $this->actingAs($coach)->getJson("/api/matches/{$match->id}/stat-sheet");

    $response->assertOk();
    expect($response->json('mode'))->toBe('roster');
    expect($response->json('fields'))->toContain(['key' => 'kills', 'label' => 'Kills']);
    expect($response->json('data.rows.0.stats'))->toHaveKey('digs');
});

it('supports summary mode for a racquet-sport doubles (team-based) match', function () {
    $sport = Sport::create(['name' => 'Badminton', 'category' => 'racket']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => 'Doubles', 'players_per_side' => 2]);
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $coach = userWithRole('coach');
    $tournament = statSheetTournament($sport, $format, $organizer, $venueOrganizer, 'Shuttle Cup');
    $teamA = statSheetTeamWithCaptain($sport, $format, $coach, 'Smashers');
    $teamB = statSheetTeamWithCaptain($sport, $format, userWithRole('coach'), 'Net Ninjas');
    $match = statSheetTeamMatch($tournament, $teamA, $teamB);

    $response = $this->actingAs($coach)->getJson("/api/matches/{$match->id}/stat-sheet");

    $response->assertOk();
    expect($response->json('mode'))->toBe('summary');
    expect($response->json('data.rows'))->toBeNull();
    expect($response->json('data.values'))->toHaveKey('smash_winners');
    expect($response->json('data.total_percent'))->toHaveKey('smash_winners');

    $update = $this->actingAs($coach)->patchJson("/api/matches/{$match->id}/stat-sheet", [
        'data' => [
            'values' => array_fill_keys(array_column($response->json('fields'), 'key'), 3),
            'total_percent' => array_fill_keys(array_column($response->json('fields'), 'key'), 50),
            'further_comments' => null,
            'recorded_by' => null,
            'signed' => null,
        ],
    ]);
    $update->assertOk();
    expect($update->json('data.values.smash_winners'))->toBe(3);
});

it('authorizes a racquet-sport singles (individual) stat sheet via who registered the player, not team captaincy', function () {
    $sport = Sport::create(['name' => 'Tennis', 'category' => 'racket']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => 'Singles', 'players_per_side' => 1]);
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $coach = userWithRole('coach');
    $stranger = userWithRole('coach');
    $playerA = User::factory()->create();
    $playerB = User::factory()->create();

    $tournament = statSheetTournament($sport, $format, $organizer, $venueOrganizer, 'Court Cup', 'best_of_sets');
    TournamentRegistration::create(['tournament_id' => $tournament->id, 'user_id' => $playerA->id, 'registered_by' => $coach->id, 'status' => 'confirmed']);
    $match = statSheetIndividualMatch($tournament, $playerA, $playerB);

    $this->actingAs($stranger)->getJson("/api/matches/{$match->id}/stat-sheet")->assertStatus(403);

    $response = $this->actingAs($coach)->getJson("/api/matches/{$match->id}/stat-sheet");
    $response->assertOk();
    expect($response->json('mode'))->toBe('summary');
    expect($response->json('participant_type'))->toBe('user');
    expect($response->json('participant_name'))->toBe($playerA->name);
    $this->assertDatabaseHas('match_stat_sheets', ['match_id' => $match->id, 'user_id' => $playerA->id, 'team_id' => null]);
});

it('locks a singles stat sheet once a best-of-sets match completes via updateSetsScore', function () {
    $sport = Sport::create(['name' => 'Table Tennis', 'category' => 'racket']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => 'Singles', 'players_per_side' => 1]);
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $coach = userWithRole('coach');
    $playerA = User::factory()->create();
    $playerB = User::factory()->create();

    $tournament = statSheetTournament($sport, $format, $organizer, $venueOrganizer, 'Paddle Cup', 'best_of_sets');
    TournamentRegistration::create(['tournament_id' => $tournament->id, 'user_id' => $playerA->id, 'registered_by' => $coach->id, 'status' => 'confirmed']);
    $match = statSheetIndividualMatch($tournament, $playerA, $playerB);

    $this->actingAs($coach)->getJson("/api/matches/{$match->id}/stat-sheet")->assertOk();

    $this->actingAs($venueOrganizer)->patchJson("/api/matches/{$match->id}/score", [
        'sets' => [
            ['score_a' => 11, 'score_b' => 5],
            ['score_a' => 11, 'score_b' => 7],
        ],
    ])->assertOk();

    $this->assertDatabaseHas('match_stat_sheets', ['match_id' => $match->id, 'user_id' => $playerA->id, 'is_locked' => true]);
});

it('lists only scheduled or live matches, across sports, for teams captained or players registered by the coach', function () {
    $ctx = statSheetBasketballSetup();

    $secondTournament = statSheetTournament($ctx['sport'], $ctx['format'], $ctx['organizer'], $ctx['venueOrganizer'], 'Hoops Cup 2');
    $completedMatch = statSheetTeamMatch($secondTournament, $ctx['teamA'], $ctx['teamB'], 'completed');

    $tennisSport = Sport::create(['name' => 'Tennis', 'category' => 'racket']);
    $tennisFormat = SportFormat::create(['sport_id' => $tennisSport->id, 'name' => 'Singles', 'players_per_side' => 1]);
    $tennisTournament = statSheetTournament($tennisSport, $tennisFormat, $ctx['organizer'], $ctx['venueOrganizer'], 'Court Cup', 'best_of_sets');
    $playerA = User::factory()->create();
    $playerB = User::factory()->create();
    TournamentRegistration::create(['tournament_id' => $tennisTournament->id, 'user_id' => $playerA->id, 'registered_by' => $ctx['coachA']->id, 'status' => 'confirmed']);
    $tennisMatch = statSheetIndividualMatch($tennisTournament, $playerA, $playerB);

    $response = $this->actingAs($ctx['coachA'])->getJson('/api/matches/mine/upcoming-stat-sheets');

    $response->assertOk();
    $matchIds = collect($response->json())->pluck('match_id');
    expect($matchIds)->toContain($ctx['match']->id, $tennisMatch->id);
    expect($matchIds)->not->toContain($completedMatch->id);
    expect($response->json())->toHaveCount(2);
});

it('returns an empty list for a coach with no captained teams and no registered players', function () {
    $lonelyCoach = userWithRole('coach');

    $this->actingAs($lonelyCoach)->getJson('/api/matches/mine/upcoming-stat-sheets')
        ->assertOk()
        ->assertJson([]);
});
