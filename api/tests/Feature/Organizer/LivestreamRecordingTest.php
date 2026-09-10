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

it('reuses the same livestream row when the organizer goes live again for the same tournament, overriding the old recording', function () {
    Storage::fake('public');
    $owner = userWithRole('organizer');
    $sport = Sport::create(['name' => 'Chess']);

    $tournament = Tournament::create([
        'organizer_id' => $owner->id, 'sport_id' => $sport->id,
        'name' => 'Rebroadcast Cup', 'format' => 'round_robin', 'starts_at' => now()->addWeek(), 'status' => 'registration',
    ]);

    $first = $this->actingAs($owner)->postJson('/api/livestreams', [
        'tournament_id' => $tournament->id,
        'title' => 'First half',
    ])->assertCreated();

    $this->actingAs($owner)->post("/api/livestreams/{$first->json('id')}/recording", [
        'video' => UploadedFile::fake()->create('first-broadcast.webm', 1000, 'video/webm'),
    ])->assertOk();
    $firstRecordingPath = Livestream::find($first->json('id'))->recording_path;

    // Going live again for the SAME tournament — this is what "the
    // organizer broadcasts the game again" actually triggers client-side
    // (LivestreamBroadcast's "Start broadcast" re-POSTs /api/livestreams).
    $second = $this->actingAs($owner)->postJson('/api/livestreams', [
        'tournament_id' => $tournament->id,
        'title' => 'Second half',
    ])->assertCreated();

    expect($second->json('id'))->toBe($first->json('id'));
    expect($this->getJson('/api/livestreams')->json())->toHaveCount(1);

    $this->actingAs($owner)->post("/api/livestreams/{$second->json('id')}/recording", [
        'video' => UploadedFile::fake()->create('second-broadcast.webm', 1000, 'video/webm'),
    ])->assertOk();

    // The first broadcast's recording is gone — overridden, not orphaned
    // alongside a second, separately-tracked livestream.
    Storage::disk('public')->assertMissing($firstRecordingPath);
    Storage::disk('public')->assertExists(Livestream::find($first->json('id'))->recording_path);
    $this->assertDatabaseCount('livestreams', 1);
});

it('keeps a re-broadcast livestream linked to the news post it was already published under', function () {
    $owner = userWithRole('organizer');
    $sport = Sport::create(['name' => 'Chess']);

    $tournament = Tournament::create([
        'organizer_id' => $owner->id, 'sport_id' => $sport->id,
        'name' => 'Published Rebroadcast Cup', 'format' => 'round_robin', 'starts_at' => now()->addWeek(), 'status' => 'registration',
    ]);

    $livestream = $this->actingAs($owner)->postJson('/api/livestreams', [
        'tournament_id' => $tournament->id,
        'title' => 'Live now',
    ])->assertCreated();

    $published = $this->actingAs($owner)->postJson("/api/livestreams/{$livestream->json('id')}/publish", [
        'title' => 'Watch live!', 'body' => 'Tune in',
    ])->assertOk();
    $newsId = $published->json('news_id');
    expect($newsId)->not->toBeNull();

    $again = $this->actingAs($owner)->postJson('/api/livestreams', [
        'tournament_id' => $tournament->id,
        'title' => 'Live again',
    ])->assertCreated();

    expect($again->json('id'))->toBe($livestream->json('id'));
    expect($again->json('news_id'))->toBe($newsId);
});
