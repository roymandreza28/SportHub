<?php

use App\Models\News;
use App\Models\NewsComment;
use App\Models\NewsReaction;

function makePublishedNews(): News
{
    $organizer = userWithRole('organizer');

    return News::create([
        'author_id' => $organizer->id,
        'title' => 'Court Renovation Complete',
        'body' => 'The Binangonan covered court is now open for bookings again.',
        'published_at' => now(),
    ]);
}

it('reports comment/reaction counts and the viewers own reaction state on the public news feed', function () {
    $news = makePublishedNews();
    $player = userWithRole('player');
    NewsReaction::create(['news_id' => $news->id, 'user_id' => $player->id]);
    NewsComment::create(['news_id' => $news->id, 'user_id' => $player->id, 'body' => 'Great!']);

    // Unauthenticated: counts are visible, but there is no viewer to react as.
    $this->getJson('/api/news')
        ->assertOk()
        ->assertJsonPath('0.reactions_count', 1)
        ->assertJsonPath('0.comments_count', 1)
        ->assertJsonPath('0.viewer_has_reacted', false);

    // The player who reacted sees their own reaction reflected.
    $this->actingAs($player)->getJson("/api/news/{$news->id}")
        ->assertOk()
        ->assertJsonPath('viewer_has_reacted', true)
        ->assertJsonPath('reactions_count', 1);
});

it('flags an organizer-authored post so the feed can hide their personal name, without leaking the roles relation', function () {
    $news = makePublishedNews();

    $response = $this->getJson('/api/news')->assertOk();

    expect($response->json('0.author.is_organizer'))->toBeTrue();
    expect($response->json('0.author.name'))->not->toBeNull();
    expect($response->json('0.author.roles'))->toBeNull();
});

it('does not flag a non-organizer author as an organizer post', function () {
    $coach = userWithRole('coach');
    News::create([
        'author_id' => $coach->id,
        'title' => 'A coachs post',
        'body' => 'Not an official organizer announcement.',
        'published_at' => now(),
    ]);

    $response = $this->getJson('/api/news')->assertOk();

    expect($response->json('0.author.is_organizer'))->toBeFalse();
});

it('lets a player or coach comment on a published article, visible to anyone reading it', function () {
    $news = makePublishedNews();
    $player = userWithRole('player');
    $coach = userWithRole('coach');

    $this->actingAs($player)->postJson("/api/news/{$news->id}/comments", ['body' => 'Nice update!'])
        ->assertCreated()
        ->assertJsonPath('body', 'Nice update!')
        ->assertJsonPath('user.name', $player->name);

    $this->actingAs($coach)->postJson("/api/news/{$news->id}/comments", ['body' => 'Looks great.'])
        ->assertCreated();

    $this->getJson("/api/news/{$news->id}/comments")->assertOk()->assertJsonCount(2);
});

it('auto-rejects a comment with inappropriate language in English or Tagalog before it is ever created', function () {
    $news = makePublishedNews();
    $player = userWithRole('player');

    $this->actingAs($player)->postJson("/api/news/{$news->id}/comments", ['body' => 'This is such bullshit.'])
        ->assertStatus(422)
        ->assertJsonValidationErrors('body');

    $this->actingAs($player)->postJson("/api/news/{$news->id}/comments", ['body' => 'Tangina mo naman.'])
        ->assertStatus(422)
        ->assertJsonValidationErrors('body');

    // A basic repeat-letter obfuscation is still caught.
    $this->actingAs($player)->postJson("/api/news/{$news->id}/comments", ['body' => 'Puta ka talaga.'])
        ->assertStatus(422);

    $this->assertDatabaseCount('news_comments', 0);

    $this->actingAs($player)->postJson("/api/news/{$news->id}/comments", ['body' => 'Great game today!'])
        ->assertCreated();
});

it('denies commenting to a role without the interact-with-news permission', function () {
    $news = makePublishedNews();
    $facilitator = userWithRole('venue_facilitator');

    $this->actingAs($facilitator)->postJson("/api/news/{$news->id}/comments", ['body' => 'Hi'])
        ->assertForbidden();
});

it('lets the main organizer comment and react on the newsfeed too, now that they browse it like a player or coach', function () {
    $news = makePublishedNews();
    $organizer = userWithRole('organizer');

    $this->actingAs($organizer)->postJson("/api/news/{$news->id}/comments", ['body' => 'Great turnout!'])
        ->assertCreated();

    $this->actingAs($organizer)->postJson("/api/news/{$news->id}/react")
        ->assertOk()
        ->assertJsonPath('reacted', true)
        ->assertJsonPath('reactions_count', 1);
});

it('lets only a comments own author delete it', function () {
    $news = makePublishedNews();
    $author = userWithRole('player');
    $other = userWithRole('player');
    $comment = NewsComment::create(['news_id' => $news->id, 'user_id' => $author->id, 'body' => 'Mine']);

    $this->actingAs($other)->deleteJson("/api/news-comments/{$comment->id}")->assertForbidden();
    $this->actingAs($author)->deleteJson("/api/news-comments/{$comment->id}")->assertNoContent();
    $this->assertDatabaseMissing('news_comments', ['id' => $comment->id]);
});

it('lets a player toggle a reaction on and off, and the count follows', function () {
    $news = makePublishedNews();
    $player = userWithRole('player');

    $this->actingAs($player)->postJson("/api/news/{$news->id}/react")
        ->assertOk()
        ->assertJsonPath('reacted', true)
        ->assertJsonPath('reactions_count', 1);

    $this->actingAs($player)->postJson("/api/news/{$news->id}/react")
        ->assertOk()
        ->assertJsonPath('reacted', false)
        ->assertJsonPath('reactions_count', 0);
});

it('keeps the newsfeed strictly read-only for players and coaches: no create, update, or delete access', function () {
    $news = makePublishedNews();
    $player = userWithRole('player');
    $coach = userWithRole('coach');

    foreach ([$player, $coach] as $user) {
        $this->actingAs($user)->postJson('/api/news', ['title' => 'x', 'body' => 'y'])->assertForbidden();
        $this->actingAs($user)->patchJson("/api/news/{$news->id}", ['title' => 'Hijacked'])->assertForbidden();
        $this->actingAs($user)->deleteJson("/api/news/{$news->id}")->assertForbidden();
    }

    $this->assertDatabaseHas('news', ['id' => $news->id, 'title' => 'Court Renovation Complete']);
});
