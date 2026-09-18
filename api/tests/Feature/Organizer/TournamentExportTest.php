<?php

use App\Models\Sport;
use App\Models\SportFormat;
use App\Models\Team;
use App\Models\TeamMember;
use App\Models\Tournament;
use App\Models\TournamentRegistration;
use App\Models\User;

function exportTestTournament(User $organizer, array $overrides = []): Tournament
{
    $sport = Sport::firstOrCreate(['name' => 'Basketball']);

    return Tournament::create(array_merge([
        'organizer_id' => $organizer->id,
        'sport_id' => $sport->id,
        'name' => 'Export Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek(),
        'status' => 'registration',
    ], $overrides));
}

it('lets the tournament organizer export registrations as CSV with the real registrant data', function () {
    $organizer = userWithRole('organizer');
    $tournament = exportTestTournament($organizer);

    $player = userWithRole('player');
    $player->update(['name' => 'Juan Dela Cruz', 'email' => 'juan@example.com']);
    TournamentRegistration::create([
        'tournament_id' => $tournament->id,
        'user_id' => $player->id,
        'status' => 'confirmed',
    ]);

    $response = $this->actingAs($organizer)->get("/api/tournaments/{$tournament->id}/registrations/export");

    $response->assertOk();
    $response->assertHeader('content-type', 'text/csv; charset=UTF-8');

    $csv = $response->streamedContent();
    expect($csv)->toContain('Registration ID');
    expect($csv)->toContain('Team Roster');
    expect($csv)->toContain('Registered At');
    expect($csv)->toContain('Individual');
    expect($csv)->toContain('Juan Dela Cruz');
    expect($csv)->toContain('juan@example.com');
    expect($csv)->toContain('confirmed');
});

it('includes each team roster member in a team tournament export', function () {
    $organizer = userWithRole('organizer');
    $tournament = exportTestTournament($organizer);
    $sport = Sport::firstOrCreate(['name' => 'Basketball'], ['category' => 'team']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => '5v5', 'players_per_side' => 5]);

    $captain = userWithRole('player');
    $captain->update(['name' => 'Team Captain']);
    $teammate = userWithRole('player');
    $teammate->update(['name' => 'Team Mate', 'email' => 'mate@example.com']);

    $team = Team::create(['sport_id' => $sport->id, 'sport_format_id' => $format->id, 'captain_id' => $captain->id, 'name' => 'The Ballers', 'status' => 'ready']);
    TeamMember::create(['team_id' => $team->id, 'user_id' => $captain->id, 'status' => 'accepted']);
    TeamMember::create(['team_id' => $team->id, 'user_id' => $teammate->id, 'status' => 'accepted']);

    TournamentRegistration::create([
        'tournament_id' => $tournament->id,
        'team_id' => $team->id,
        'status' => 'confirmed',
    ]);

    $csv = $this->actingAs($organizer)
        ->get("/api/tournaments/{$tournament->id}/registrations/export")
        ->streamedContent();

    expect($csv)->toContain('Team');
    expect($csv)->toContain('The Ballers');
    expect($csv)->toContain('Team Captain');
    expect($csv)->toContain('Team Mate <mate@example.com>');
});

it('denies exporting registrations to an organizer who does not own the tournament', function () {
    $owner = userWithRole('organizer');
    $tournament = exportTestTournament($owner);
    $otherOrganizer = userWithRole('organizer');

    $this->actingAs($otherOrganizer)
        ->get("/api/tournaments/{$tournament->id}/registrations/export")
        ->assertForbidden();
});

it('denies exporting registrations to a non-organizer role', function () {
    $organizer = userWithRole('organizer');
    $tournament = exportTestTournament($organizer);
    $player = userWithRole('player');

    $this->actingAs($player)
        ->get("/api/tournaments/{$tournament->id}/registrations/export")
        ->assertForbidden();
});
