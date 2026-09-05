<?php

use App\Models\Bracket;
use App\Models\GameMatch;
use App\Models\Sport;
use App\Models\SportFormat;
use App\Models\Tournament;
use App\Models\User;

function clockTestMatch(User $organizer, User $venueOrganizer, ?User $playerA = null, ?User $playerB = null): GameMatch
{
    $sport = Sport::create(['name' => 'Basketball', 'category' => 'team']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => '5v5', 'players_per_side' => 5]);
    $tournament = Tournament::create([
        'organizer_id' => $organizer->id,
        'venue_organizer_id' => $venueOrganizer->id,
        'sport_id' => $sport->id,
        'sport_format_id' => $format->id,
        'name' => 'Clock Cup',
        'format' => 'single_elimination',
        'starts_at' => now()->addWeek(),
        'status' => 'ongoing',
        'scoring_type' => 'single_score',
    ]);
    $bracket = Bracket::create(['tournament_id' => $tournament->id, 'structure' => [], 'current_round' => 1]);

    return GameMatch::create([
        'bracket_id' => $bracket->id,
        'round' => 1,
        'participant_a_id' => ($playerA ?? User::factory()->create())->id,
        'participant_b_id' => ($playerB ?? User::factory()->create())->id,
        'score_a' => 0,
        'score_b' => 0,
        'status' => 'live',
    ]);
}

it('lets the assigned venue organizer sync the game clock, broadcasting it and stamping clock_synced_at', function () {
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $match = clockTestMatch($organizer, $venueOrganizer);

    $response = $this->actingAs($venueOrganizer)->patchJson("/api/matches/{$match->id}/clock", [
        'clock_seconds_remaining' => 645,
        'clock_shot_seconds_remaining' => 18,
        'clock_running' => true,
        'clock_period_label' => 'Period 2 / 4',
    ]);

    $response->assertOk()
        ->assertJsonPath('clock_seconds_remaining', 645)
        ->assertJsonPath('clock_shot_seconds_remaining', 18)
        ->assertJsonPath('clock_running', true)
        ->assertJsonPath('clock_period_label', 'Period 2 / 4');

    $match->refresh();
    expect($match->clock_seconds_remaining)->toBe(645);
    expect($match->clock_shot_seconds_remaining)->toBe(18);
    expect($match->clock_running)->toBeTrue();
    expect($match->clock_period_label)->toBe('Period 2 / 4');
    expect($match->clock_synced_at)->not->toBeNull();
});

it('accepts a null clock_seconds_remaining for a clockless state like 3x3 sudden death', function () {
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $match = clockTestMatch($organizer, $venueOrganizer);

    $this->actingAs($venueOrganizer)->patchJson("/api/matches/{$match->id}/clock", [
        'clock_seconds_remaining' => null,
        'clock_running' => false,
        'clock_period_label' => 'Sudden Death',
    ])->assertOk()->assertJsonPath('clock_seconds_remaining', null);
});

it('requires clock_running to be a boolean', function () {
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $match = clockTestMatch($organizer, $venueOrganizer);

    $this->actingAs($venueOrganizer)->patchJson("/api/matches/{$match->id}/clock", [
        'clock_seconds_remaining' => 100,
    ])->assertStatus(422);
});

it('denies syncing the clock to a venue organizer not assigned to the match', function () {
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $stranger = userWithRole('venue_organizer');
    $match = clockTestMatch($organizer, $venueOrganizer);

    $this->actingAs($stranger)->patchJson("/api/matches/{$match->id}/clock", [
        'clock_seconds_remaining' => 100,
        'clock_running' => false,
    ])->assertStatus(403);

    expect($match->fresh()->clock_synced_at)->toBeNull();
});

it('ships the clock fields on a shared news posts match snapshot', function () {
    $organizer = userWithRole('organizer');
    $venueOrganizer = userWithRole('venue_organizer');
    $match = clockTestMatch($organizer, $venueOrganizer);
    $match->update([
        'clock_seconds_remaining' => 300,
        'clock_shot_seconds_remaining' => 14,
        'clock_running' => true,
        'clock_period_label' => 'Period 3 / 4',
        'clock_synced_at' => now(),
    ]);

    $news = \App\Models\News::create([
        'author_id' => $organizer->id,
        'match_id' => $match->id,
        'title' => 'Live now',
        'body' => 'Big game underway.',
        'published_at' => now(),
    ]);

    $response = $this->getJson('/api/news');

    $response->assertOk();
    $item = collect($response->json())->firstWhere('id', $news->id);
    expect($item['match']['clock_seconds_remaining'])->toBe(300);
    expect($item['match']['clock_shot_seconds_remaining'])->toBe(14);
    expect($item['match']['clock_running'])->toBeTrue();
    expect($item['match']['clock_period_label'])->toBe('Period 3 / 4');
    expect($item['match']['clock_synced_at'])->not->toBeNull();
});
