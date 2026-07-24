<?php

it('finds player and coach accounts by name or email, excluding self and other roles', function () {
    $me = userWithRole('player');
    $findablePlayer = userWithRole('player');
    $findablePlayer->update(['name' => 'Findable Player']);
    $findableCoach = userWithRole('coach');
    $findableCoach->update(['name' => 'Findable Coach']);
    $organizer = userWithRole('organizer');
    $organizer->update(['name' => 'Findable Organizer']);

    $response = $this->actingAs($me)->getJson('/api/social/users?search=Findable');

    $response->assertOk();
    $names = collect($response->json('data'))->pluck('name');

    expect($names)->toContain('Findable Player', 'Findable Coach');
    expect($names)->not->toContain('Findable Organizer');
    expect(collect($response->json('data'))->pluck('id'))->not->toContain($me->id);
});
