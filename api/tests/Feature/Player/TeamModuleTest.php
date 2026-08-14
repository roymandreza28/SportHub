<?php

use App\Models\Friendship;
use App\Models\Sport;
use App\Models\SportFormat;
use App\Models\Team;

it('denies team creation to a role without the permission', function () {
    $facilitator = userWithRole('venue_facilitator');
    $sport = Sport::create(['name' => 'Basketball']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => '5v5', 'players_per_side' => 5]);

    $this->actingAs($facilitator)->postJson('/api/teams', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
    ])->assertForbidden();
});

it('lets a coach create and matchmake a team too, not just players', function () {
    $coach = userWithRole('coach');
    $sport = Sport::create(['name' => 'Basketball']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => '5v5', 'players_per_side' => 5]);

    $this->actingAs($coach)->postJson('/api/teams', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
    ])->assertCreated();
});

it('notifies the invitee when invited to a team, regardless of whether captain or invitee is a coach or player', function () {
    $coachCaptain = userWithRole('coach');
    $playerInvitee = userWithRole('player');
    $playerCaptain = userWithRole('player');
    $coachInvitee = userWithRole('coach');
    $sport = Sport::create(['name' => 'Volleyball']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => '6v6', 'players_per_side' => 6]);

    Friendship::create([
        'requester_id' => $coachCaptain->id, 'addressee_id' => $playerInvitee->id, 'status' => 'accepted',
        'pair_key' => Friendship::pairKeyFor($coachCaptain->id, $playerInvitee->id),
    ]);
    Friendship::create([
        'requester_id' => $playerCaptain->id, 'addressee_id' => $coachInvitee->id, 'status' => 'accepted',
        'pair_key' => Friendship::pairKeyFor($playerCaptain->id, $coachInvitee->id),
    ]);

    $coachTeam = $this->actingAs($coachCaptain)->postJson('/api/teams', [
        'sport_id' => $sport->id, 'sport_format_id' => $format->id,
    ])->json();
    $playerTeam = $this->actingAs($playerCaptain)->postJson('/api/teams', [
        'sport_id' => $sport->id, 'sport_format_id' => $format->id,
    ])->json();

    $this->actingAs($coachCaptain)->postJson("/api/teams/{$coachTeam['id']}/invite", ['user_id' => $playerInvitee->id])
        ->assertCreated();
    $this->actingAs($playerCaptain)->postJson("/api/teams/{$playerTeam['id']}/invite", ['user_id' => $coachInvitee->id])
        ->assertCreated();

    $playerNotifications = $this->actingAs($playerInvitee)->getJson('/api/notifications')->assertOk();
    expect($playerNotifications->json('0.type'))->toBe('team_invite');
    expect($playerNotifications->json('0.data.captain_name'))->toBe($coachCaptain->name);
    expect($playerNotifications->json('0.data.team_name'))->toBe($coachTeam['name']);

    $coachNotifications = $this->actingAs($coachInvitee)->getJson('/api/notifications')->assertOk();
    expect($coachNotifications->json('0.type'))->toBe('team_invite');
    expect($coachNotifications->json('0.data.captain_name'))->toBe($playerCaptain->name);
});

it('rejects creating a team for a format that does not require one', function () {
    $player = userWithRole('player');
    $sport = Sport::create(['name' => 'Chess']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => 'Individual', 'players_per_side' => 1]);

    $this->actingAs($player)->postJson('/api/teams', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
    ])->assertStatus(422);
});

it('creates a team with the captain auto-accepted as the first member', function () {
    $captain = userWithRole('player');
    $sport = Sport::create(['name' => 'Basketball']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => '3v3', 'players_per_side' => 3]);

    $response = $this->actingAs($captain)->postJson('/api/teams', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
    ])->assertCreated();

    expect($response->json('status'))->toBe('forming');
    expect($response->json('members'))->toHaveCount(1);
    expect($response->json('members.0.user_id'))->toBe($captain->id);
    expect($response->json('members.0.status'))->toBe('accepted');
});

it('only lets a captain invite an actual friend, and the team becomes ready once the roster fills', function () {
    $captain = userWithRole('player');
    $friend = userWithRole('player');
    $stranger = userWithRole('player');
    $sport = Sport::create(['name' => 'Badminton']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => 'Doubles', 'players_per_side' => 2]);

    Friendship::create([
        'requester_id' => $captain->id,
        'addressee_id' => $friend->id,
        'status' => 'accepted',
        'pair_key' => Friendship::pairKeyFor($captain->id, $friend->id),
    ]);

    $team = $this->actingAs($captain)->postJson('/api/teams', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
    ])->json();

    $this->actingAs($captain)->postJson("/api/teams/{$team['id']}/invite", ['user_id' => $stranger->id])
        ->assertStatus(422);

    $invite = $this->actingAs($captain)->postJson("/api/teams/{$team['id']}/invite", ['user_id' => $friend->id])
        ->assertCreated();

    $this->assertDatabaseHas('team_members', ['team_id' => $team['id'], 'user_id' => $friend->id, 'status' => 'invited']);

    // A non-invitee cannot accept someone else's invite.
    $this->actingAs($stranger)->postJson("/api/team-members/{$invite->json('id')}/accept")->assertForbidden();

    $this->actingAs($friend)->postJson("/api/team-members/{$invite->json('id')}/accept")->assertOk();

    expect(Team::find($team['id'])->status)->toBe('ready');
});

it('lets a captain remove a member and drops the team back to forming', function () {
    $captain = userWithRole('player');
    $friend = userWithRole('player');
    $sport = Sport::create(['name' => 'Badminton']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => 'Doubles', 'players_per_side' => 2]);

    $team = createReadyTeam($captain, $sport, $format);
    $memberRow = $team->members()->where('user_id', '!=', $captain->id)->first();

    expect($team->fresh()->status)->toBe('ready');

    $this->actingAs($captain)->deleteJson("/api/teams/{$team->id}/members/{$memberRow->id}")->assertNoContent();

    expect($team->fresh()->status)->toBe('forming');
});

it('lets a non-captain member quit the team on their own, not just the captain remove them', function () {
    $captain = userWithRole('coach');
    $sport = Sport::create(['name' => 'Volleyball']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => '6v6', 'players_per_side' => 6]);

    // createReadyTeam fills the remaining roster slots with freshly-created
    // players, so grab any non-captain row from the finished team.
    $team = createReadyTeam($captain, $sport, $format);
    $memberRow = $team->members()->where('user_id', '!=', $captain->id)->first();
    $memberUser = $memberRow->user;

    // Someone with no stake in the team cannot remove this member.
    $outsider = userWithRole('player');
    $this->actingAs($outsider)->deleteJson("/api/teams/{$team->id}/members/{$memberRow->id}")->assertForbidden();

    // The member themself can quit without being the captain.
    $this->actingAs($memberUser)->deleteJson("/api/teams/{$team->id}/members/{$memberRow->id}")->assertNoContent();
    $this->assertDatabaseMissing('team_members', ['id' => $memberRow->id]);
    expect($team->fresh()->status)->toBe('forming');
});

it('requires a ready team before matchmaking for a multi-player format, and blocks a non-captain from using it', function () {
    $captain = userWithRole('player');
    $teammate = userWithRole('player');
    $sport = Sport::create(['name' => 'Volleyball']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => '6v6', 'players_per_side' => 6]);

    $this->actingAs($captain)->postJson('/api/matchmaking-requests', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
    ])->assertStatus(422);

    $forming = Team::create([
        'sport_id' => $sport->id, 'sport_format_id' => $format->id, 'captain_id' => $captain->id, 'status' => 'forming',
    ]);
    $forming->members()->create(['user_id' => $captain->id, 'status' => 'accepted', 'responded_at' => now()]);

    $this->actingAs($captain)->postJson('/api/matchmaking-requests', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'team_id' => $forming->id,
    ])->assertStatus(422);

    $ready = createReadyTeam($captain, $sport, $format);

    $this->actingAs($teammate)->postJson('/api/matchmaking-requests', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'team_id' => $ready->id,
    ])->assertStatus(403);

    $this->actingAs($captain)->postJson('/api/matchmaking-requests', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'team_id' => $ready->id,
    ])->assertCreated()->assertJsonPath('status', 'open');
});

it('pairs two ready teams of the same format and skill tier, and exposes the opposing roster', function () {
    $captainA = userWithRole('player');
    $captainB = userWithRole('player');
    $sport = Sport::create(['name' => 'Basketball']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => '5v5', 'players_per_side' => 5]);

    $teamA = createReadyTeam($captainA, $sport, $format);
    $teamB = createReadyTeam($captainB, $sport, $format);

    $this->actingAs($captainA)->postJson('/api/matchmaking-requests', [
        'sport_id' => $sport->id, 'sport_format_id' => $format->id, 'team_id' => $teamA->id,
    ])->assertJsonPath('status', 'open');

    $this->actingAs($captainB)->postJson('/api/matchmaking-requests', [
        'sport_id' => $sport->id, 'sport_format_id' => $format->id, 'team_id' => $teamB->id,
    ])->assertJsonPath('status', 'matched');

    $mineA = $this->actingAs($captainA)->getJson('/api/matchmaking-requests/mine')->assertOk();
    expect($mineA->json('0.opponent_team.id'))->toBe($teamB->id);
    expect($mineA->json('0.opponent_team.members'))->toHaveCount(5);
});

it('rejects starting a second active matchmaking request for the same team', function () {
    $captain = userWithRole('player');
    $sport = Sport::create(['name' => 'Basketball']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => '5v5', 'players_per_side' => 5]);
    $team = createReadyTeam($captain, $sport, $format);

    $this->actingAs($captain)->postJson('/api/matchmaking-requests', [
        'sport_id' => $sport->id, 'sport_format_id' => $format->id, 'team_id' => $team->id,
    ])->assertCreated();

    $this->actingAs($captain)->postJson('/api/matchmaking-requests', [
        'sport_id' => $sport->id, 'sport_format_id' => $format->id, 'team_id' => $team->id,
    ])->assertStatus(422);
});
