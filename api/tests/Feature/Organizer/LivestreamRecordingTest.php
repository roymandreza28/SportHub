<?php

use App\Models\Livestream;
use App\Models\Sport;
use App\Models\Tournament;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

it("lets the assigned livestream organizer upload a recording of their own broadcast, exposing recording_url", function () {
    Storage::fake('public');
    $owner = userWithRole('organizer');
    $livestreamOrganizer = userWithRole('livestream_organizer');
    $sport = Sport::create(['name' => 'Chess']);

    $tournament = Tournament::create([
        'organizer_id' => $owner->id, 'sport_id' => $sport->id,
        'name' => 'Recorded Cup', 'format' => 'round_robin', 'starts_at' => now()->addWeek(), 'status' => 'registration',
        'livestream_organizer_id' => $livestreamOrganizer->id,
    ]);

    $livestream = Livestream::create([
        'tournament_id' => $tournament->id, 'title' => 'Court 1 feed',
        'broadcaster_id' => $livestreamOrganizer->id, 'status' => 'ended',
    ]);

    $response = $this->actingAs($livestreamOrganizer)->post("/api/livestreams/{$livestream->id}/recording", [
        'video' => UploadedFile::fake()->create('broadcast.webm', 5000, 'video/webm'),
    ]);

    $response->assertOk();
    expect($response->json('recording_url'))->not->toBeNull();

    Storage::disk('public')->assertExists($livestream->fresh()->recording_path);
});

it('lets the main organizer upload a recording too, since they own the tournament the stream is tied to', function () {
    Storage::fake('public');
    $owner = userWithRole('organizer');
    $sport = Sport::create(['name' => 'Chess']);

    $tournament = Tournament::create([
        'organizer_id' => $owner->id, 'sport_id' => $sport->id,
        'name' => 'Owner Upload Cup', 'format' => 'round_robin', 'starts_at' => now()->addWeek(), 'status' => 'registration',
    ]);

    $livestream = Livestream::create([
        'tournament_id' => $tournament->id, 'title' => 'Feed',
        'broadcaster_id' => $owner->id, 'status' => 'ended',
    ]);

    $this->actingAs($owner)->post("/api/livestreams/{$livestream->id}/recording", [
        'video' => UploadedFile::fake()->create('broadcast.webm', 1000, 'video/webm'),
    ])->assertOk();
});

it("denies uploading a recording to someone with no relationship to the livestream's tournament", function () {
    Storage::fake('public');
    $owner = userWithRole('organizer');
    $stranger = userWithRole('livestream_organizer');
    $sport = Sport::create(['name' => 'Chess']);

    $tournament = Tournament::create([
        'organizer_id' => $owner->id, 'sport_id' => $sport->id,
        'name' => 'No Access Cup', 'format' => 'round_robin', 'starts_at' => now()->addWeek(), 'status' => 'registration',
    ]);

    $livestream = Livestream::create([
        'tournament_id' => $tournament->id, 'title' => 'Feed',
        'broadcaster_id' => $owner->id, 'status' => 'ended',
    ]);

    $this->actingAs($stranger)->post("/api/livestreams/{$livestream->id}/recording", [
        'video' => UploadedFile::fake()->create('broadcast.webm', 1000, 'video/webm'),
    ])->assertForbidden();
});

it('rejects a non-video file as a recording upload', function () {
    Storage::fake('public');
    $owner = userWithRole('organizer');
    $sport = Sport::create(['name' => 'Chess']);

    $tournament = Tournament::create([
        'organizer_id' => $owner->id, 'sport_id' => $sport->id,
        'name' => 'Bad Upload Cup', 'format' => 'round_robin', 'starts_at' => now()->addWeek(), 'status' => 'registration',
    ]);

    $livestream = Livestream::create([
        'tournament_id' => $tournament->id, 'title' => 'Feed',
        'broadcaster_id' => $owner->id, 'status' => 'ended',
    ]);

    $this->actingAs($owner)->post("/api/livestreams/{$livestream->id}/recording", [
        'video' => UploadedFile::fake()->create('notes.pdf', 100, 'application/pdf'),
    ])->assertStatus(422);
});

it('replaces an existing recording rather than orphaning the old file on a re-upload', function () {
    Storage::fake('public');
    $owner = userWithRole('organizer');
    $sport = Sport::create(['name' => 'Chess']);

    $tournament = Tournament::create([
        'organizer_id' => $owner->id, 'sport_id' => $sport->id,
        'name' => 'Re-upload Cup', 'format' => 'round_robin', 'starts_at' => now()->addWeek(), 'status' => 'registration',
    ]);

    $livestream = Livestream::create([
        'tournament_id' => $tournament->id, 'title' => 'Feed',
        'broadcaster_id' => $owner->id, 'status' => 'ended',
    ]);

    $this->actingAs($owner)->post("/api/livestreams/{$livestream->id}/recording", [
        'video' => UploadedFile::fake()->create('first.webm', 1000, 'video/webm'),
    ])->assertOk();
    $firstPath = $livestream->fresh()->recording_path;

    $this->actingAs($owner)->post("/api/livestreams/{$livestream->id}/recording", [
        'video' => UploadedFile::fake()->create('second.webm', 1000, 'video/webm'),
    ])->assertOk();

    Storage::disk('public')->assertMissing($firstPath);
    Storage::disk('public')->assertExists($livestream->fresh()->recording_path);
});
