<?php

use App\Models\Sport;
use App\Models\SportFormat;

// Bowling itself needs no bespoke backend logic — TournamentController's
// team-format validation and BracketService's bracket generation are both
// already sport-agnostic (confirmed by SportTournamentRestrictionsTest for
// the validation half, and BracketServiceTest for bracket generation).
// These tests just lock in that the seeded data (Sport + its 3
// SportFormats — see SportsSeeder) actually round-trips through that
// existing, generic machinery correctly.
it('lets an organizer create an individual (Scratch Singles) bowling tournament with no sport_format_id', function () {
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');
    $sport = Sport::firstOrCreate(['name' => 'Bowling'], ['category' => 'other']);

    $this->actingAs($organizer)->postJson('/api/tournaments', [
        'sport_id' => $sport->id,
        'name' => 'BRCC Scratch Singles Open',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek()->toIso8601String(),
        'venue_organizer_id' => $venueOrganizer->id,
        'livestream_organizer_id' => $livestreamOrganizer->id,
        'scoring_type' => 'best_of_sets',
        'sets_to_win' => 2,
    ])->assertCreated()->assertJsonPath('sport_format_id', null);
});

it('lets an organizer create a team (Handicap Doubles) bowling tournament', function () {
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');
    $sport = Sport::firstOrCreate(['name' => 'Bowling'], ['category' => 'other']);
    $format = SportFormat::firstOrCreate(
        ['sport_id' => $sport->id, 'name' => 'Handicap Doubles'],
        ['players_per_side' => 2]
    );

    $this->actingAs($organizer)->postJson('/api/tournaments', [
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'name' => 'BRCC Handicap Doubles League',
        'format' => 'round_robin',
        'starts_at' => now()->addWeek()->toIso8601String(),
        'venue_organizer_id' => $venueOrganizer->id,
        'livestream_organizer_id' => $livestreamOrganizer->id,
        'scoring_type' => 'best_of_sets',
        'sets_to_win' => 2,
    ])->assertCreated()->assertJsonPath('sport_format_id', $format->id);
});

it('rejects "Scratch Singles" itself as a sport_format_id, same as every other sport\'s Singles format', function () {
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');
    $sport = Sport::firstOrCreate(['name' => 'Bowling'], ['category' => 'other']);
    $singles = SportFormat::firstOrCreate(
        ['sport_id' => $sport->id, 'name' => 'Scratch Singles'],
        ['players_per_side' => 1]
    );

    $this->actingAs($organizer)->postJson('/api/tournaments', [
        'sport_id' => $sport->id,
        'sport_format_id' => $singles->id,
        'name' => 'Invalid Format Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek()->toIso8601String(),
        'venue_organizer_id' => $venueOrganizer->id,
        'livestream_organizer_id' => $livestreamOrganizer->id,
    ])->assertStatus(422)->assertJsonValidationErrors('sport_format_id');
});
