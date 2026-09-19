<?php

use App\Models\Bracket;
use App\Models\Conversation;
use App\Models\Court;
use App\Models\Friendship;
use App\Models\GameMatch;
use App\Models\Livestream;
use App\Models\MatchmakingRequest;
use App\Models\News;
use App\Models\PlayerProfile;
use App\Models\Post;
use App\Models\PostMedia;
use App\Models\Sport;
use App\Models\SportFormat;
use App\Models\Team;
use App\Models\TeamMember;
use App\Models\Tournament;
use App\Models\User;
use App\Models\Venue;
use App\Models\VenueRegistration;

it('clears tournament/team/matchmaking/newsfeed/social data while leaving venues, accounts, and reference data untouched', function () {
    $organizer = userWithRole('organizer');
    $player = userWithRole('player');
    $friend = userWithRole('player');
    $venueOrganizer = userWithRole('venue_organizer');

    $sport = Sport::create(['name' => 'Basketball', 'category' => 'team']);
    $format = SportFormat::create(['sport_id' => $sport->id, 'name' => '5v5', 'players_per_side' => 5]);

    $venue = Venue::create([
        'facilitator_id' => $organizer->id, 'name' => 'Test Venue', 'address' => '123 St',
        'latitude' => 14.5, 'longitude' => 121.0, 'status' => 'active',
    ]);
    $court = Court::create(['venue_id' => $venue->id, 'name' => 'Court 1', 'type' => 'court']);

    PlayerProfile::create(['user_id' => $player->id, 'bio' => 'Hoops enjoyer']);

    $tournament = Tournament::create([
        'organizer_id' => $organizer->id, 'sport_id' => $sport->id, 'name' => 'Cup',
        'format' => 'single_elimination', 'starts_at' => now(), 'status' => 'ongoing', 'venue_id' => $venue->id,
    ]);
    $bracket = Bracket::create(['tournament_id' => $tournament->id, 'structure' => [], 'current_round' => 1]);
    GameMatch::create(['bracket_id' => $bracket->id, 'round' => 1, 'status' => 'scheduled']);

    $team = Team::create(['sport_id' => $sport->id, 'sport_format_id' => $format->id, 'captain_id' => $player->id, 'status' => 'forming']);
    TeamMember::create(['team_id' => $team->id, 'user_id' => $player->id, 'status' => 'accepted']);

    Livestream::create(['tournament_id' => $tournament->id, 'title' => 'Live', 'platform' => 'youtube', 'embed_url' => 'x']);
    News::create(['author_id' => $organizer->id, 'title' => 'Big news', 'body' => 'Big news', 'tournament_id' => $tournament->id]);
    VenueRegistration::create(['venue_id' => $venue->id, 'user_id' => $player->id, 'court_id' => $court->id, 'starts_at' => now(), 'ends_at' => now()->addHour()]);
    MatchmakingRequest::create(['user_id' => $player->id, 'sport_id' => $sport->id, 'status' => 'open']);
    Friendship::create(['requester_id' => $player->id, 'addressee_id' => $friend->id, 'status' => 'accepted', 'pair_key' => Friendship::pairKeyFor($player->id, $friend->id)]);
    $conversation = Conversation::create(['type' => 'direct', 'created_by' => $player->id, 'direct_key' => "{$player->id}-{$friend->id}"]);
    \Illuminate\Support\Facades\DB::table('conversation_participants')->insert([
        'conversation_id' => $conversation->id, 'user_id' => $player->id, 'joined_at' => now(), 'created_at' => now(), 'updated_at' => now(),
    ]);
    $post = Post::create(['user_id' => $player->id]);
    $post->media()->create(['path' => 'x.jpg', 'position' => 0]);
    \Illuminate\Support\Facades\DB::table('notifications')->insert([
        'user_id' => $player->id, 'type' => 'test', 'data' => json_encode(['x' => 1]), 'created_at' => now(), 'updated_at' => now(),
    ]);

    $this->artisan('system:reset-tournaments-and-newsfeed', ['--force' => true])->assertSuccessful();

    expect(Tournament::count())->toBe(0);
    expect(Bracket::count())->toBe(0);
    expect(GameMatch::count())->toBe(0);
    expect(Team::count())->toBe(0);
    expect(TeamMember::count())->toBe(0);
    expect(Livestream::count())->toBe(0);
    expect(News::count())->toBe(0);
    expect(VenueRegistration::count())->toBe(0);
    expect(MatchmakingRequest::count())->toBe(0);
    expect(Friendship::count())->toBe(0);
    expect(Conversation::count())->toBe(0);
    expect(\Illuminate\Support\Facades\DB::table('conversation_participants')->count())->toBe(0);
    expect(Post::count())->toBe(0);
    expect(PostMedia::count())->toBe(0);
    expect(\Illuminate\Support\Facades\DB::table('notifications')->count())->toBe(0);

    // Untouched.
    expect(Venue::count())->toBe(1);
    expect(Court::count())->toBe(1);
    expect(User::count())->toBeGreaterThanOrEqual(4);
    expect(PlayerProfile::count())->toBe(1);
    expect(Sport::count())->toBe(1);
    expect(SportFormat::count())->toBe(1);
});

it('reports zero without erroring when everything in scope is already empty', function () {
    $this->artisan('system:reset-tournaments-and-newsfeed', ['--force' => true])
        ->expectsOutputToContain('Nothing to clear')
        ->assertSuccessful();
});

it('deletes nothing on --dry-run', function () {
    $organizer = userWithRole('organizer');
    $sport = Sport::create(['name' => 'Basketball', 'category' => 'team']);
    Tournament::create([
        'organizer_id' => $organizer->id, 'sport_id' => $sport->id, 'name' => 'Cup',
        'format' => 'single_elimination', 'starts_at' => now(), 'status' => 'ongoing',
    ]);

    $this->artisan('system:reset-tournaments-and-newsfeed', ['--dry-run' => true])
        ->expectsOutputToContain('Dry run')
        ->assertSuccessful();

    expect(Tournament::count())->toBe(1);
});
