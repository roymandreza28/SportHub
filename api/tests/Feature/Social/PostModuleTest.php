<?php

use App\Models\Post;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;

it('lets a player upload a post image with a caption, and stores it on the public disk', function () {
    Storage::fake('public');
    $player = userWithRole('player');

    $response = $this->actingAs($player)->post('/api/social/posts', [
        'image' => UploadedFile::fake()->create('game.jpg', 100, 'image/jpeg'),
        'caption' => 'Great match today!',
    ]);

    $response->assertCreated();
    $response->assertJsonPath('caption', 'Great match today!');

    $post = Post::first();
    Storage::disk('public')->assertExists($post->image_path);
    expect($post->image_url)->toContain($post->image_path);
});

it('rejects a non-image upload', function () {
    Storage::fake('public');
    $player = userWithRole('player');

    $this->actingAs($player)->post('/api/social/posts', [
        'image' => UploadedFile::fake()->create('doc.pdf', 100),
    ])->assertStatus(422);
});

it('lets any player or coach view another users posts, open visibility', function () {
    Storage::fake('public');
    $author = userWithRole('coach');
    $viewer = userWithRole('player');

    $this->actingAs($author)->post('/api/social/posts', [
        'image' => UploadedFile::fake()->create('post.jpg', 100, 'image/jpeg'),
    ])->assertCreated();

    $this->actingAs($viewer)->getJson("/api/social/posts?user_id={$author->id}")
        ->assertOk()
        ->assertJsonCount(1, 'data');
});

it('lets only the owner delete their post', function () {
    Storage::fake('public');
    $owner = userWithRole('player');
    $other = userWithRole('player');

    $post = Post::create([
        'user_id' => $owner->id,
        'image_path' => 'posts/'.$owner->id.'/fake.jpg',
        'caption' => null,
    ]);

    $this->actingAs($other)->deleteJson("/api/social/posts/{$post->id}")->assertForbidden();
    $this->actingAs($owner)->deleteJson("/api/social/posts/{$post->id}")->assertNoContent();

    expect(Post::find($post->id))->toBeNull();
});
