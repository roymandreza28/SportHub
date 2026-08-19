<?php

use App\Models\Sport;
use App\Models\SportFormat;
use App\Models\Tournament;

it('rejects an individual tournament for a team-category sport', function () {
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');
    $sport = Sport::create(['name' => 'Test Team Sport', 'category' => 'team']);
    SportFormat::create(['sport_id' => $sport->id, 'name' => 'Squad', 'players_per_side' => 5]);

    $response = $this->actingAs($organizer)->postJson('/api/tournaments', [
        'sport_id' => $sport->id,
        'name' => 'No Format Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek()->toIso8601String(),
        'venue_organizer_id' => $venueOrganizer->id,
        'livestream_organizer_id' => $livestreamOrganizer->id,
        // sport_format_id omitted on purpose
    ]);

    $response->assertStatus(422);
    $response->assertJsonValidationErrors('sport_format_id');
});

it('allows a team-category sport tournament when sport_format_id is given', function () {
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');
    $sport = Sport::create(['name' => 'Test Team Sport', 'category' => 'team']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => 'Squad', 'players_per_side' => 5]);

    $this->actingAs($organizer)->postJson('/api/tournaments', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'name' => 'With Format Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek()->toIso8601String(),
        'venue_organizer_id' => $venueOrganizer->id,
        'livestream_organizer_id' => $livestreamOrganizer->id,
    ])->assertCreated();
});

it('does not restrict a non-team-category sport to team-only', function () {
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');
    $sport = Sport::create(['name' => 'Test Racket Sport', 'category' => 'racket']);

    $this->actingAs($organizer)->postJson('/api/tournaments', [
        'sport_id' => $sport->id,
        'name' => 'Racket Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek()->toIso8601String(),
        'venue_organizer_id' => $venueOrganizer->id,
        'livestream_organizer_id' => $livestreamOrganizer->id,
        // sport_format_id omitted on purpose — this sport isn't team-category.
    ])->assertCreated();
});

it('allows every bracket format for a team-category sport tournament', function (string $format) {
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');
    $sport = Sport::create(['name' => 'Test Team Sport '.$format, 'category' => 'team']);
    $sportFormat = SportFormat::create(['sport_id' => $sport->id, 'name' => 'Squad', 'players_per_side' => 5]);

    $this->actingAs($organizer)->postJson('/api/tournaments', [
        'sport_id' => $sport->id,
        'sport_format_id' => $sportFormat->id,
        'name' => 'Format Cup',
        'format' => $format,
        'starts_at' => now()->addWeek()->toIso8601String(),
        'venue_organizer_id' => $venueOrganizer->id,
        'livestream_organizer_id' => $livestreamOrganizer->id,
    ])->assertCreated();
})->with(['single_elimination', 'double_elimination', 'round_robin', 'group_stage', 'swiss']);

it('rejects an individual player registration against a team tournament', function () {
    $organizer = userWithRole('organizer');
    $coach = userWithRole('coach');
    $player = userWithRole('player');
    $sport = Sport::create(['name' => 'Test Team Sport', 'category' => 'team']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => 'Squad', 'players_per_side' => 5]);

    $tournament = Tournament::create([
        'organizer_id' => $organizer->id,
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'name' => 'Team Registration Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek(),
        'status' => 'registration',
    ]);

    $this->actingAs($coach)->postJson("/api/tournaments/{$tournament->id}/registrations", [
        'user_id' => $player->id,
    ])->assertStatus(422);
});
