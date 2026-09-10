<?php

use App\Models\User;
use App\Models\Venue;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

function makeMediaVenue(User $facilitator): Venue
{
    return Venue::create([
        'facilitator_id' => $facilitator->id,
        'name' => 'Photo Test Venue',
        'address' => '1 Test St',
        'latitude' => 1,
        'longitude' => 1,
    ]);
}

it('lets a facilitator upload photos to their own venue, exposing each one\'s url', function () {
    Storage::fake('public');
    $facilitator = userWithRole('venue_facilitator');
    $venue = makeMediaVenue($facilitator);

    $response = $this->actingAs($facilitator)->post("/api/venues/{$venue->id}/media", [
        'media' => [
            UploadedFile::fake()->create('court.jpg', 500, 'image/jpeg'),
            UploadedFile::fake()->create('lobby.png', 500, 'image/png'),
        ],
    ]);

    $response->assertOk();
    expect($response->json())->toHaveCount(2);
    expect($response->json('0.url'))->not->toBeNull();

    expect($venue->fresh()->media)->toHaveCount(2);
    foreach ($venue->fresh()->media as $media) {
        Storage::disk('public')->assertExists($media->path);
    }
});

it('appends new photos after existing ones rather than colliding positions', function () {
    Storage::fake('public');
    $facilitator = userWithRole('venue_facilitator');
    $venue = makeMediaVenue($facilitator);

    $this->actingAs($facilitator)->post("/api/venues/{$venue->id}/media", [
        'media' => [UploadedFile::fake()->create('first.jpg', 200, 'image/jpeg')],
    ])->assertOk();

    $this->actingAs($facilitator)->post("/api/venues/{$venue->id}/media", [
        'media' => [UploadedFile::fake()->create('second.jpg', 200, 'image/jpeg')],
    ])->assertOk();

    $positions = $venue->fresh()->media->pluck('position')->all();
    expect($positions)->toBe([1, 2]);
});

it('lets a facilitator delete one of their venue\'s photos', function () {
    Storage::fake('public');
    $facilitator = userWithRole('venue_facilitator');
    $venue = makeMediaVenue($facilitator);

    $this->actingAs($facilitator)->post("/api/venues/{$venue->id}/media", [
        'media' => [UploadedFile::fake()->create('photo.jpg', 200, 'image/jpeg')],
    ])->assertOk();

    $media = $venue->fresh()->media->first();
    $path = $media->path;

    $this->actingAs($facilitator)->deleteJson("/api/venue-media/{$media->id}")->assertNoContent();

    Storage::disk('public')->assertMissing($path);
    expect($venue->fresh()->media)->toHaveCount(0);
});

it('denies uploading or deleting photos on a venue owned by a different facilitator', function () {
    Storage::fake('public');
    $owner = userWithRole('venue_facilitator');
    $stranger = userWithRole('venue_facilitator');
    $venue = makeMediaVenue($owner);

    $this->actingAs($stranger)->post("/api/venues/{$venue->id}/media", [
        'media' => [UploadedFile::fake()->create('photo.jpg', 200, 'image/jpeg')],
    ])->assertForbidden();

    $this->actingAs($owner)->post("/api/venues/{$venue->id}/media", [
        'media' => [UploadedFile::fake()->create('photo.jpg', 200, 'image/jpeg')],
    ])->assertOk();
    $media = $venue->fresh()->media->first();

    $this->actingAs($stranger)->deleteJson("/api/venue-media/{$media->id}")->assertForbidden();
});

it('rejects a non-image file as a venue photo', function () {
    Storage::fake('public');
    $facilitator = userWithRole('venue_facilitator');
    $venue = makeMediaVenue($facilitator);

    $this->actingAs($facilitator)->post("/api/venues/{$venue->id}/media", [
        'media' => [UploadedFile::fake()->create('brochure.pdf', 200, 'application/pdf')],
    ])->assertStatus(422);
});

it('includes each venue\'s photos on the public venue directory', function () {
    Storage::fake('public');
    $facilitator = userWithRole('venue_facilitator');
    $venue = makeMediaVenue($facilitator);
    $venue->update(['status' => 'active']);

    $this->actingAs($facilitator)->post("/api/venues/{$venue->id}/media", [
        'media' => [UploadedFile::fake()->create('photo.jpg', 200, 'image/jpeg')],
    ])->assertOk();

    $this->getJson('/api/venues')->assertOk()->assertJsonCount(1, '0.media');
});
