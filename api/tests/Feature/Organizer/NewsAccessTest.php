<?php

use App\Models\News;

it('lets every organizer-family role and the venue facilitator publish, edit, and delete their own news post', function () {
    foreach (['organizer', 'venue_organizer', 'livestream_organizer', 'venue_facilitator'] as $role) {
        $user = userWithRole($role);

        $created = $this->actingAs($user)->postJson('/api/news', [
            'title' => "{$role} update", 'body' => 'Community news.',
        ])->assertCreated();

        $newsId = $created->json('id');

        $this->actingAs($user)->patchJson("/api/news/{$newsId}", ['title' => 'Edited title'])
            ->assertOk()->assertJsonPath('title', 'Edited title');

        $this->actingAs($user)->deleteJson("/api/news/{$newsId}")->assertNoContent();
        expect(News::find($newsId))->toBeNull();
    }
});

it('still denies posting news to roles outside the organizer family and venue facilitator', function () {
    // admin is deliberately excluded here — Gate::before() grants it every
    // ability regardless of the 'manage news' permission, same as elsewhere
    // in the app (see RolesAndPermissionsSeeder's own comment on this).
    foreach (['player', 'coach'] as $role) {
        $user = userWithRole($role);
        $this->actingAs($user)->postJson('/api/news', ['title' => 'x', 'body' => 'y'])->assertForbidden();
    }
});

it('never lets one organizer-family member edit or delete another one\'s news post', function () {
    $author = userWithRole('venue_organizer');
    $other = userWithRole('livestream_organizer');

    $newsId = $this->actingAs($author)->postJson('/api/news', [
        'title' => 'Mine', 'body' => 'Not yours.',
    ])->assertCreated()->json('id');

    $this->actingAs($other)->patchJson("/api/news/{$newsId}", ['title' => 'Hijacked'])->assertForbidden();
    $this->actingAs($other)->deleteJson("/api/news/{$newsId}")->assertForbidden();
});
