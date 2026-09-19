<?php

use App\Models\Post;
use App\Models\PostMedia;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

it('lets a player upload a single-image post with a caption, and stores it on the public disk', function () {
    Storage::fake('public');
    $player = userWithRole('player');

    $response = $this->actingAs($player)->post('/api/social/posts', [
        'images' => [UploadedFile::fake()->create('game.jpg', 100, 'image/jpeg')],
        'caption' => 'Great match today!',
    ]);

    $response->assertCreated();
    $response->assertJsonPath('caption', 'Great match today!');
    $response->assertJsonCount(1, 'media');

    $post = Post::with('media')->first();
    expect($post->media)->toHaveCount(1);
    Storage::disk('public')->assertExists($post->media->first()->path);
    expect($post->media->first()->url)->toContain($post->media->first()->path);
});

it('lets a player upload a carousel post with multiple images, in upload order', function () {
    Storage::fake('public');
    $player = userWithRole('player');

    $response = $this->actingAs($player)->post('/api/social/posts', [
        'images' => [
            UploadedFile::fake()->create('one.jpg', 100, 'image/jpeg'),
            UploadedFile::fake()->create('two.jpg', 100, 'image/jpeg'),
            UploadedFile::fake()->create('three.jpg', 100, 'image/jpeg'),
        ],
    ]);

    $response->assertCreated();
    $response->assertJsonCount(3, 'media');

    $post = Post::with('media')->first();
    expect($post->media)->toHaveCount(3);
    expect($post->media->pluck('position')->all())->toEqual([0, 1, 2]);
    foreach ($post->media as $media) {
        Storage::disk('public')->assertExists($media->path);
    }
});

it('rejects a post with more than 10 images, or with a non-image among them', function () {
    Storage::fake('public');
    $player = userWithRole('player');

    $tooMany = array_fill(0, 11, UploadedFile::fake()->create('x.jpg', 10, 'image/jpeg'));
    $this->actingAs($player)->post('/api/social/posts', ['images' => $tooMany])->assertStatus(422);

    $this->actingAs($player)->post('/api/social/posts', [
        'images' => [UploadedFile::fake()->create('doc.pdf', 100)],
    ])->assertStatus(422);
});

it('lets any player or coach view another users posts, including every image in a carousel post', function () {
    Storage::fake('public');
    $author = userWithRole('coach');
    $viewer = userWithRole('player');

    $this->actingAs($author)->post('/api/social/posts', [
        'images' => [
            UploadedFile::fake()->create('a.jpg', 100, 'image/jpeg'),
            UploadedFile::fake()->create('b.jpg', 100, 'image/jpeg'),
        ],
    ])->assertCreated();

    $response = $this->actingAs($viewer)->getJson("/api/social/posts?user_id={$author->id}")
        ->assertOk()
        ->assertJsonCount(1, 'data');

    expect($response->json('data.0.media'))->toHaveCount(2);
});

it('lets only the owner delete their post, removing every one of its images from disk', function () {
    Storage::fake('public');
    $owner = userWithRole('player');
    $other = userWithRole('player');

    $post = Post::create(['user_id' => $owner->id, 'caption' => null]);
    $paths = [];
    foreach ([0, 1] as $position) {
        $media = PostMedia::create([
            'post_id' => $post->id,
            'path' => 'posts/'.$owner->id.'/fake-'.$position.'.jpg',
            'position' => $position,
        ]);
        Storage::disk('public')->put($media->path, 'fake image bytes');
        $paths[] = $media->path;
    }

    $this->actingAs($other)->deleteJson("/api/social/posts/{$post->id}")->assertForbidden();
    $this->actingAs($owner)->deleteJson("/api/social/posts/{$post->id}")->assertNoContent();

    expect(Post::find($post->id))->toBeNull();
    expect(PostMedia::where('post_id', $post->id)->count())->toBe(0);
    foreach ($paths as $path) {
        Storage::disk('public')->assertMissing($path);
    }
});
