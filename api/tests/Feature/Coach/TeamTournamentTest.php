<?php

use App\Models\Conversation;
use App\Models\Friendship;
use App\Models\Sport;
use App\Models\SportFormat;
use App\Models\Team;
use App\Models\Tournament;
use App\Models\TournamentRegistration;
use App\Models\User;

function doublesSetup(): array
{
    $sport = Sport::create(['name' => 'Badminton']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => 'Doubles', 'players_per_side' => 2]);

    return [$sport, $format];
}

function befriend(User $a, User $b): void
{
    Friendship::create([
        'requester_id' => $a->id,
        'addressee_id' => $b->id,
        'status' => 'accepted',
        'pair_key' => Friendship::pairKeyFor($a->id, $b->id),
    ]);
}

it('lets an organizer create a team tournament with single elimination', function () {
    [$sport, $format] = doublesSetup();
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');

    $response = $this->actingAs($organizer)->postJson('/api/tournaments', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'name' => 'Doubles Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek(),
        'venue_organizer_id' => $venueOrganizer->id,
        'livestream_organizer_id' => $livestreamOrganizer->id,
    ]);

    $response->assertCreated();
    expect($response->json('sport_format_id'))->toBe($format->id);
});

it('lets an organizer create a team tournament in every bracket format', function (string $format) {
    [$sport, $sportFormat] = doublesSetup();
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');

    $this->actingAs($organizer)->postJson('/api/tournaments', [
        'sport_id' => $sport->id,
        'sport_format_id' => $sportFormat->id,
        'name' => 'Doubles Cup',
        'format' => $format,
        'starts_at' => now()->addWeek(),
        'venue_organizer_id' => $venueOrganizer->id,
        'livestream_organizer_id' => $livestreamOrganizer->id,
    ])->assertCreated();
})->with(['single_elimination', 'double_elimination', 'round_robin', 'group_stage', 'swiss']);

it('does not auto-enroll the coach as a roster member when they create a team', function () {
    [$sport, $format] = doublesSetup();
    $coach = userWithRole('coach');

    $response = $this->actingAs($coach)->postJson('/api/teams', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'name' => 'Coach Cody Squad',
    ]);

    $response->assertCreated();
    expect($response->json('members'))->toHaveCount(0);
    $this->assertDatabaseMissing('team_members', ['team_id' => $response->json('id'), 'user_id' => $coach->id]);
});

it('lets a coach add a friend directly to a team roster with no accept step', function () {
    [$sport, $format] = doublesSetup();
    $coach = userWithRole('coach');
    $playerA = userWithRole('player');
    $playerB = userWithRole('player');
    befriend($coach, $playerA);
    befriend($coach, $playerB);

    $team = $this->actingAs($coach)->postJson('/api/teams', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
    ])->json();

    $this->actingAs($coach)->postJson("/api/teams/{$team['id']}/members", ['user_id' => $playerA->id])
        ->assertCreated();

    expect(Team::find($team['id'])->status)->toBe('forming');

    $this->actingAs($coach)->postJson("/api/teams/{$team['id']}/members", ['user_id' => $playerB->id])
        ->assertCreated();

    expect(Team::find($team['id'])->status)->toBe('ready');

    $this->assertDatabaseHas('team_members', ['team_id' => $team['id'], 'user_id' => $playerA->id, 'status' => 'accepted']);
    $this->assertDatabaseHas('team_members', ['team_id' => $team['id'], 'user_id' => $playerB->id, 'status' => 'accepted']);
});

it('rejects adding a player the coach is not friends with', function () {
    [$sport, $format] = doublesSetup();
    $coach = userWithRole('coach');
    $stranger = userWithRole('player');

    $team = $this->actingAs($coach)->postJson('/api/teams', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
    ])->json();

    $this->actingAs($coach)->postJson("/api/teams/{$team['id']}/members", ['user_id' => $stranger->id])
        ->assertStatus(422);

    $this->assertDatabaseMissing('team_members', ['team_id' => $team['id'], 'user_id' => $stranger->id]);
});

it('lets a coach remove a player they added by mistake', function () {
    [$sport, $format] = doublesSetup();
    $coach = userWithRole('coach');
    $playerA = userWithRole('player');
    $playerB = userWithRole('player');
    befriend($coach, $playerA);
    befriend($coach, $playerB);

    $team = $this->actingAs($coach)->postJson('/api/teams', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
    ])->json();
    $this->actingAs($coach)->postJson("/api/teams/{$team['id']}/members", ['user_id' => $playerA->id]);
    $member = $this->actingAs($coach)->postJson("/api/teams/{$team['id']}/members", ['user_id' => $playerB->id])->json();

    expect(Team::find($team['id'])->status)->toBe('ready');

    $this->actingAs($coach)->deleteJson("/api/teams/{$team['id']}/members/{$member['id']}")
        ->assertNoContent();

    $this->assertDatabaseMissing('team_members', ['team_id' => $team['id'], 'user_id' => $playerB->id]);
    expect(Team::find($team['id'])->status)->toBe('forming');
});

it('lets a coach add bench players past the sport format minimum, with no maximum cap', function () {
    [$sport, $format] = doublesSetup();
    $coach = userWithRole('coach');
    $playerA = userWithRole('player');
    $playerB = userWithRole('player');
    $playerC = userWithRole('player');
    befriend($coach, $playerA);
    befriend($coach, $playerB);
    befriend($coach, $playerC);

    $team = $this->actingAs($coach)->postJson('/api/teams', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
    ])->json();

    $this->actingAs($coach)->postJson("/api/teams/{$team['id']}/members", ['user_id' => $playerA->id])->assertCreated();
    $this->actingAs($coach)->postJson("/api/teams/{$team['id']}/members", ['user_id' => $playerB->id])->assertCreated();

    // Doubles' minimum (2) is already met — a third, bench player must still
    // be addable, unlike the matchmaking-team invite() flow which caps out.
    $this->actingAs($coach)->postJson("/api/teams/{$team['id']}/members", ['user_id' => $playerC->id])
        ->assertCreated();

    expect(Team::find($team['id'])->status)->toBe('ready');
    expect(Team::find($team['id'])->acceptedMemberCount())->toBe(3);
});

it('rejects registering a team that is not full yet', function () {
    [$sport, $format] = doublesSetup();
    $organizer = userWithRole('organizer');
    $coach = userWithRole('coach');
    $playerA = userWithRole('player');
    befriend($coach, $playerA);

    $tournament = Tournament::create([
        'organizer_id' => $organizer->id,
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'name' => 'Doubles Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek(),
        'status' => 'registration',
    ]);

    $team = $this->actingAs($coach)->postJson('/api/teams', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
    ])->json();
    $this->actingAs($coach)->postJson("/api/teams/{$team['id']}/members", ['user_id' => $playerA->id]);

    $this->actingAs($coach)->postJson("/api/tournaments/{$tournament->id}/team-registrations", ['team_id' => $team['id']])
        ->assertStatus(422);
});

it('registers a ready team for a tournament and rejects double registration', function () {
    [$sport, $format] = doublesSetup();
    $organizer = userWithRole('organizer');
    $coach = userWithRole('coach');
    $playerA = userWithRole('player');
    $playerB = userWithRole('player');
    befriend($coach, $playerA);
    befriend($coach, $playerB);

    $tournament = Tournament::create([
        'organizer_id' => $organizer->id,
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'name' => 'Doubles Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek(),
        'status' => 'registration',
    ]);

    $team = $this->actingAs($coach)->postJson('/api/teams', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
    ])->json();
    $this->actingAs($coach)->postJson("/api/teams/{$team['id']}/members", ['user_id' => $playerA->id]);
    $this->actingAs($coach)->postJson("/api/teams/{$team['id']}/members", ['user_id' => $playerB->id]);

    $this->actingAs($coach)->postJson("/api/tournaments/{$tournament->id}/team-registrations", ['team_id' => $team['id']])
        ->assertCreated();

    $this->assertDatabaseHas('tournament_registrations', ['tournament_id' => $tournament->id, 'team_id' => $team['id']]);

    $this->actingAs($coach)->postJson("/api/tournaments/{$tournament->id}/team-registrations", ['team_id' => $team['id']])
        ->assertStatus(422);
});

it('rejects a coach registering a second team they captain for a tournament they already registered a team for', function () {
    [$sport, $format] = doublesSetup();
    $organizer = userWithRole('organizer');
    $coach = userWithRole('coach');
    $playerA = userWithRole('player');
    $playerB = userWithRole('player');
    $playerC = userWithRole('player');
    $playerD = userWithRole('player');
    befriend($coach, $playerA);
    befriend($coach, $playerB);
    befriend($coach, $playerC);
    befriend($coach, $playerD);

    $tournament = Tournament::create([
        'organizer_id' => $organizer->id,
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'name' => 'Doubles Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek(),
        'status' => 'registration',
    ]);

    $teamOne = $this->actingAs($coach)->postJson('/api/teams', [
        'sport_id' => $sport->id, 'sport_format_id' => $format->id, 'name' => 'Team One',
    ])->json();
    $this->actingAs($coach)->postJson("/api/teams/{$teamOne['id']}/members", ['user_id' => $playerA->id]);
    $this->actingAs($coach)->postJson("/api/teams/{$teamOne['id']}/members", ['user_id' => $playerB->id]);

    $teamTwo = $this->actingAs($coach)->postJson('/api/teams', [
        'sport_id' => $sport->id, 'sport_format_id' => $format->id, 'name' => 'Team Two',
    ])->json();
    $this->actingAs($coach)->postJson("/api/teams/{$teamTwo['id']}/members", ['user_id' => $playerC->id]);
    $this->actingAs($coach)->postJson("/api/teams/{$teamTwo['id']}/members", ['user_id' => $playerD->id]);

    $this->actingAs($coach)->postJson("/api/tournaments/{$tournament->id}/team-registrations", ['team_id' => $teamOne['id']])
        ->assertCreated();

    $response = $this->actingAs($coach)->postJson("/api/tournaments/{$tournament->id}/team-registrations", ['team_id' => $teamTwo['id']]);
    $response->assertStatus(422);
    expect($response->json('message'))->toContain('already registered a team');

    $this->assertDatabaseMissing('tournament_registrations', ['tournament_id' => $tournament->id, 'team_id' => $teamTwo['id']]);
});

it("rejects registering a team that has a player already registered with another team in the same tournament, naming that player", function () {
    [$sport, $format] = doublesSetup();
    $organizer = userWithRole('organizer');
    $coachOne = userWithRole('coach');
    $coachTwo = userWithRole('coach');
    $playerA = userWithRole('player');
    $playerB = userWithRole('player');
    $sharedPlayer = userWithRole('player');
    befriend($coachOne, $playerA);
    befriend($coachOne, $sharedPlayer);
    befriend($coachTwo, $playerB);
    befriend($coachTwo, $sharedPlayer);

    $tournament = Tournament::create([
        'organizer_id' => $organizer->id,
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'name' => 'Doubles Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek(),
        'status' => 'registration',
    ]);

    $teamOne = $this->actingAs($coachOne)->postJson('/api/teams', [
        'sport_id' => $sport->id, 'sport_format_id' => $format->id, 'name' => 'Team One',
    ])->json();
    $this->actingAs($coachOne)->postJson("/api/teams/{$teamOne['id']}/members", ['user_id' => $playerA->id]);
    $this->actingAs($coachOne)->postJson("/api/teams/{$teamOne['id']}/members", ['user_id' => $sharedPlayer->id]);

    // $sharedPlayer sits on both rosters — a friend of both coaches.
    $teamTwo = $this->actingAs($coachTwo)->postJson('/api/teams', [
        'sport_id' => $sport->id, 'sport_format_id' => $format->id, 'name' => 'Team Two',
    ])->json();
    $this->actingAs($coachTwo)->postJson("/api/teams/{$teamTwo['id']}/members", ['user_id' => $playerB->id]);
    $this->actingAs($coachTwo)->postJson("/api/teams/{$teamTwo['id']}/members", ['user_id' => $sharedPlayer->id]);

    $this->actingAs($coachOne)->postJson("/api/tournaments/{$tournament->id}/team-registrations", ['team_id' => $teamOne['id']])
        ->assertCreated();

    $response = $this->actingAs($coachTwo)->postJson("/api/tournaments/{$tournament->id}/team-registrations", ['team_id' => $teamTwo['id']]);
    $response->assertStatus(422);
    expect($response->json('message'))->toContain('A player on your team is already registered');
    expect($response->json('message'))->toContain($sharedPlayer->name);

    $this->assertDatabaseMissing('tournament_registrations', ['tournament_id' => $tournament->id, 'team_id' => $teamTwo['id']]);
});

it('generates a bracket seeded with team participants and advances the winning team on score completion', function () {
    [$sport, $format] = doublesSetup();
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');

    $tournament = Tournament::create([
        'organizer_id' => $organizer->id,
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'name' => 'Doubles Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek(),
        'status' => 'registration',
        'venue_organizer_id' => $venueOrganizer->id,
    ]);

    $teamIds = [];
    // A separate coach per team — a coach registers at most one entrant per
    // tournament (see the new rule tests below), so two teams in the same
    // bracket need two different coaches, same as real tournaments would.
    foreach (['Team A', 'Team B'] as $name) {
        $coach = userWithRole('coach');
        $playerA = userWithRole('player');
        $playerB = userWithRole('player');
        befriend($coach, $playerA);
        befriend($coach, $playerB);

        $team = $this->actingAs($coach)->postJson('/api/teams', [
            'sport_id' => $sport->id,
            'sport_format_id' => $format->id,
            'name' => $name,
        ])->json();
        $this->actingAs($coach)->postJson("/api/teams/{$team['id']}/members", ['user_id' => $playerA->id]);
        $this->actingAs($coach)->postJson("/api/teams/{$team['id']}/members", ['user_id' => $playerB->id]);

        $this->actingAs($coach)->postJson("/api/tournaments/{$tournament->id}/team-registrations", ['team_id' => $team['id']])
            ->assertCreated();

        $teamIds[] = $team['id'];
    }

    $bracketResponse = $this->actingAs($organizer)->postJson("/api/tournaments/{$tournament->id}/generate-bracket");
    $bracketResponse->assertCreated();

    $match = \App\Models\GameMatch::first();
    expect($match->participant_a_team_id)->not->toBeNull();
    expect($match->participant_b_team_id)->not->toBeNull();
    expect($match->participant_a_id)->toBeNull();
    expect($match->participant_b_id)->toBeNull();
    expect($teamIds)->toContain($match->participant_a_team_id);
    expect($teamIds)->toContain($match->participant_b_team_id);
    expect($match->participant_a_team_id)->not->toBe($match->participant_b_team_id);

    $winningTeamId = $match->participant_a_team_id;
    $winningTeamName = Team::find($winningTeamId)->name;

    $scoreResponse = $this->actingAs($venueOrganizer)->patchJson("/api/matches/{$match->id}/score", [
        'score_a' => 21,
        'score_b' => 15,
        'status' => 'completed',
    ]);
    $scoreResponse->assertOk();
    expect($scoreResponse->json('winner.id'))->toBe($winningTeamId);
    expect($scoreResponse->json('winner.name'))->toBe($winningTeamName);

    $match->refresh();
    expect($match->winner_team_id)->toBe($winningTeamId);
    expect($tournament->fresh()->status)->toBe('completed');
});

it('lets the assigned venue organizer read both teams full rosters for a match, for score/foul attribution', function () {
    [$sport, $format] = doublesSetup();
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');

    $tournament = Tournament::create([
        'organizer_id' => $organizer->id,
        'venue_organizer_id' => $venueOrganizer->id,
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'name' => 'Doubles Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek(),
        'status' => 'registration',
    ]);

    $rosterNames = [];
    // A separate coach per team — see the same note above.
    foreach (['Team A', 'Team B'] as $name) {
        $coach = userWithRole('coach');
        $playerA = userWithRole('player');
        $playerB = userWithRole('player');
        befriend($coach, $playerA);
        befriend($coach, $playerB);
        $rosterNames[$name] = [$playerA->name, $playerB->name];

        $team = $this->actingAs($coach)->postJson('/api/teams', [
            'sport_id' => $sport->id,
            'sport_format_id' => $format->id,
            'name' => $name,
        ])->json();
        $this->actingAs($coach)->postJson("/api/teams/{$team['id']}/members", ['user_id' => $playerA->id]);
        $this->actingAs($coach)->postJson("/api/teams/{$team['id']}/members", ['user_id' => $playerB->id]);

        $this->actingAs($coach)->postJson("/api/tournaments/{$tournament->id}/team-registrations", ['team_id' => $team['id']]);
    }

    $this->actingAs($organizer)->postJson("/api/tournaments/{$tournament->id}/generate-bracket")->assertCreated();
    $match = \App\Models\GameMatch::first();

    $response = $this->actingAs($venueOrganizer)->getJson("/api/matches/{$match->id}/roster");

    $response->assertOk();
    expect($response->json('team_a.members'))->toHaveCount(2);
    expect($response->json('team_b.members'))->toHaveCount(2);
    $allNames = collect($response->json('team_a.members'))->pluck('name')
        ->merge(collect($response->json('team_b.members'))->pluck('name'));
    expect($allNames)->toContain(...array_merge($rosterNames['Team A'], $rosterNames['Team B']));
});

it('denies a match roster read to an organizer not assigned to that tournament', function () {
    [$sport, $format] = doublesSetup();
    $organizer = userWithRole('organizer');
    $stranger = userWithRole('venue_organizer');

    $tournament = Tournament::create([
        'organizer_id' => $organizer->id,
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'name' => 'Doubles Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek(),
        'status' => 'registration',
    ]);

    // A separate coach per team — see the same note above.
    foreach (['Team A', 'Team B'] as $name) {
        $coach = userWithRole('coach');
        $playerA = userWithRole('player');
        $playerB = userWithRole('player');
        befriend($coach, $playerA);
        befriend($coach, $playerB);

        $team = $this->actingAs($coach)->postJson('/api/teams', [
            'sport_id' => $sport->id,
            'sport_format_id' => $format->id,
            'name' => $name,
        ])->json();
        $this->actingAs($coach)->postJson("/api/teams/{$team['id']}/members", ['user_id' => $playerA->id]);
        $this->actingAs($coach)->postJson("/api/teams/{$team['id']}/members", ['user_id' => $playerB->id]);

        $this->actingAs($coach)->postJson("/api/tournaments/{$tournament->id}/team-registrations", ['team_id' => $team['id']]);
    }

    $this->actingAs($organizer)->postJson("/api/tournaments/{$tournament->id}/generate-bracket")->assertCreated();
    $match = \App\Models\GameMatch::first();

    $this->actingAs($stranger)->getJson("/api/matches/{$match->id}/roster")->assertStatus(403);
});

it('notifies every accepted team member, not just the captain, when a team registers', function () {
    [$sport, $format] = doublesSetup();
    $organizer = userWithRole('organizer');
    $coach = userWithRole('coach');
    $playerA = userWithRole('player');
    $playerB = userWithRole('player');
    befriend($coach, $playerA);
    befriend($coach, $playerB);

    $tournament = Tournament::create([
        'organizer_id' => $organizer->id,
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'name' => 'Doubles Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek(),
        'status' => 'registration',
    ]);

    $team = $this->actingAs($coach)->postJson('/api/teams', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
    ])->json();
    $this->actingAs($coach)->postJson("/api/teams/{$team['id']}/members", ['user_id' => $playerA->id]);
    $this->actingAs($coach)->postJson("/api/teams/{$team['id']}/members", ['user_id' => $playerB->id]);

    $this->actingAs($coach)->postJson("/api/tournaments/{$tournament->id}/team-registrations", ['team_id' => $team['id']])
        ->assertCreated();

    $this->assertDatabaseHas('notifications', ['user_id' => $playerA->id, 'type' => 'tournament_update']);
    $this->assertDatabaseHas('notifications', ['user_id' => $playerB->id, 'type' => 'tournament_update']);
});

it('rejects registering a team once a tournament has left draft/registration', function () {
    [$sport, $format] = doublesSetup();
    $organizer = userWithRole('organizer');
    $coach = userWithRole('coach');
    $playerA = userWithRole('player');
    $playerB = userWithRole('player');
    befriend($coach, $playerA);
    befriend($coach, $playerB);

    $tournament = Tournament::create([
        'organizer_id' => $organizer->id,
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'name' => 'Closed Doubles Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek(),
        'status' => 'preparation',
    ]);

    $team = $this->actingAs($coach)->postJson('/api/teams', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
    ])->json();
    $this->actingAs($coach)->postJson("/api/teams/{$team['id']}/members", ['user_id' => $playerA->id]);
    $this->actingAs($coach)->postJson("/api/teams/{$team['id']}/members", ['user_id' => $playerB->id]);

    $this->actingAs($coach)->postJson("/api/tournaments/{$tournament->id}/team-registrations", ['team_id' => $team['id']])
        ->assertStatus(422);
});

it('creates exactly one group conversation for a team on registration, with the captain and accepted members attached, even after registering for a second tournament', function () {
    [$sport, $format] = doublesSetup();
    $organizerOne = userWithRole('organizer');
    $organizerTwo = userWithRole('organizer');
    $coach = userWithRole('coach');
    $playerA = userWithRole('player');
    $playerB = userWithRole('player');
    befriend($coach, $playerA);
    befriend($coach, $playerB);

    $tournamentOne = Tournament::create([
        'organizer_id' => $organizerOne->id,
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'name' => 'Conversation Cup One',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek(),
        'status' => 'registration',
    ]);
    $tournamentTwo = Tournament::create([
        'organizer_id' => $organizerTwo->id,
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'name' => 'Conversation Cup Two',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek(),
        'status' => 'registration',
    ]);

    $team = $this->actingAs($coach)->postJson('/api/teams', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'name' => 'Conversation Squad',
    ])->json();
    $this->actingAs($coach)->postJson("/api/teams/{$team['id']}/members", ['user_id' => $playerA->id]);
    $this->actingAs($coach)->postJson("/api/teams/{$team['id']}/members", ['user_id' => $playerB->id]);

    $this->actingAs($coach)->postJson("/api/tournaments/{$tournamentOne->id}/team-registrations", ['team_id' => $team['id']])
        ->assertCreated();

    $this->assertDatabaseCount('conversations', 1);
    $conversation = Conversation::where('team_id', $team['id'])->first();
    expect($conversation)->not->toBeNull();
    expect($conversation->type)->toBe('group');
    expect($conversation->name)->toBe('Conversation Squad');

    $participantIds = $conversation->participants->pluck('id')->sort()->values();
    expect($participantIds->all())->toEqualCanonicalizing([$coach->id, $playerA->id, $playerB->id]);

    // Registering the very same team for a second tournament must not create
    // a second conversation or duplicate its participants.
    $this->actingAs($coach)->postJson("/api/tournaments/{$tournamentTwo->id}/team-registrations", ['team_id' => $team['id']])
        ->assertCreated();

    $this->assertDatabaseCount('conversations', 1);
    expect($conversation->fresh()->participants)->toHaveCount(3);
});
