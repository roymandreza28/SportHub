<?php

use App\Models\News;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

it('lets an organizer publish a news article with multiple image attachments', function () {
    Storage::fake('public');
    $organizer = userWithRole('organizer');

    $response = $this->actingAs($organizer)->post('/api/news', [
        'title' => 'Community Day Recap',
        'body' => 'What a turnout!',
        'media' => [
            UploadedFile::fake()->create('one.jpg', 200, 'image/jpeg'),
            UploadedFile::fake()->create('two.png', 200, 'image/png'),
        ],
    ]);

    $response->assertCreated();
    expect($response->json('media'))->toHaveCount(2);
    expect($response->json('media.0.type'))->toBe('image');

    $news = News::first();
    expect($news->media)->toHaveCount(2);
    foreach ($news->media as $media) {
        Storage::disk('public')->assertExists($media->path);
        expect($media->url)->toContain($media->path);
    }
});

it('lets an organizer attach a video, distinguished from images by stored type', function () {
    Storage::fake('public');
    $organizer = userWithRole('organizer');

    $response = $this->actingAs($organizer)->post('/api/news', [
        'title' => 'Championship Highlights',
        'body' => 'Watch the final point.',
        'media' => [
            UploadedFile::fake()->create('highlight.mp4', 500, 'video/mp4'),
        ],
    ]);

    $response->assertCreated();
    expect($response->json('media.0.type'))->toBe('video');
});

it('rejects a disallowed file type as a news attachment', function () {
    Storage::fake('public');
    $organizer = userWithRole('organizer');

    $this->actingAs($organizer)->post('/api/news', [
        'title' => 'Bad attachment',
        'body' => 'This should fail.',
        'media' => [UploadedFile::fake()->create('notes.pdf', 100, 'application/pdf')],
    ])->assertStatus(422);
});

it('rejects a news attachment over the size limit', function () {
    Storage::fake('public');
    $organizer = userWithRole('organizer');

    $this->actingAs($organizer)->post('/api/news', [
        'title' => 'Too big',
        'body' => 'This should fail.',
        'media' => [UploadedFile::fake()->create('huge.mp4', 16000, 'video/mp4')],
    ])->assertStatus(422);
});

it('publishes a news article with no attachments at all, unaffected by the media feature', function () {
    Storage::fake('public');
    $organizer = userWithRole('organizer');

    $this->actingAs($organizer)->post('/api/news', [
        'title' => 'Text only',
        'body' => 'No pictures today.',
    ])->assertCreated()
        ->assertJsonPath('media', []);
});

it('deletes stored media files from disk when the news article is deleted', function () {
    Storage::fake('public');
    $organizer = userWithRole('organizer');

    $response = $this->actingAs($organizer)->post('/api/news', [
        'title' => 'To be deleted',
        'body' => 'Gone soon.',
        'media' => [UploadedFile::fake()->create('temp.jpg', 100, 'image/jpeg')],
    ])->assertCreated();

    $news = News::find($response->json('id'));
    $path = $news->media->first()->path;
    Storage::disk('public')->assertExists($path);

    $this->actingAs($organizer)->deleteJson("/api/news/{$news->id}")->assertNoContent();

    Storage::disk('public')->assertMissing($path);
});

it('includes media urls on the public news feed for anyone reading it', function () {
    Storage::fake('public');
    $organizer = userWithRole('organizer');

    $this->actingAs($organizer)->post('/api/news', [
        'title' => 'Public read',
        'body' => 'Everyone can see this.',
        'media' => [UploadedFile::fake()->create('open.jpg', 100, 'image/jpeg')],
    ])->assertCreated();

    $this->getJson('/api/news')->assertOk()->assertJsonPath('0.media.0.type', 'image');
});
