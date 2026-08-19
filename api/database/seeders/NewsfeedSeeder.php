<?php

namespace Database\Seeders;

use App\Models\News;
use App\Models\NewsComment;
use App\Models\NewsReaction;
use App\Models\Tournament;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;

// Turns every tournament SampleDataSeeder/ExtendedTournamentsSeeder created
// into a newsfeed post (status-appropriate wording — a draft tournament gets
// an unpublished teaser, a completed one gets a champion congrats post too),
// plus a couple of standalone posts, then sprinkles reactions/comments from
// the seeded player/coach pool so the feed reads as a lived-in community
// rather than a fresh, empty table. News is organizer-authored only (see
// RolesAndPermissionsSeeder's 'manage news' permission), so every post here
// uses the one demo organizer account.
class NewsfeedSeeder extends Seeder
{
    private const COMMENT_TEMPLATES = [
        "Can't wait for this one!",
        'Goodluck sa amin! 🏆',
        'See you all there!',
        'This is going to be a great matchup.',
        'Proud of the team for making it this far.',
        'Sayang, sana nanalo. Next time na lang!',
        'Anyone know what time the venue opens?',
        'Solid effort from everyone who joined.',
        'Following this bracket closely 👀',
        'Congrats to the whole squad!',
    ];

    public function run(): void
    {
        $organizer = User::where('email', 'organizer@sporthub.test')->first();
        if (! $organizer) {
            return;
        }

        // Regenerated fresh every seed run, same rationale as
        // SampleDataSeeder's Tournament::query()->delete() — avoids
        // duplicate/stale posts piling up across repeated `db:seed` runs.
        News::query()->delete();

        $engagementPool = User::role('player')->get()->merge(User::role('coach')->get())->shuffle();

        $this->post(
            $organizer, null,
            'Welcome to SportHub Morong! 🎉',
            "SportHub is now live for the whole municipality — browse open tournaments, book a court, or register your team in just a few taps. Say hello in the comments and let us know what sport you're most excited to see!",
            now()->subDays(10),
            $engagementPool
        );

        $this->post(
            $organizer, null,
            'Facility Update: New equipment at Morong Gymnasium',
            'A fresh set of basketballs and volleyball equipment just arrived at Morong Gymnasium, courtesy of our venue facilitator. Ballers, expect better grip and bounce consistency starting this week!',
            now()->subDays(8),
            $engagementPool,
            'https://picsum.photos/seed/sporthub-gym-equipment/800/450'
        );

        foreach (Tournament::with(['sport', 'venue', 'championTeam', 'champion'])->get() as $tournament) {
            $this->postForTournament($organizer, $tournament, $engagementPool);
        }
    }

    private function postForTournament(User $organizer, Tournament $tournament, Collection $engagementPool): void
    {
        $sportName = $tournament->sport?->name ?? 'sport';
        $venueName = $tournament->venue?->name;
        $where = $venueName ? " at {$venueName}" : '';

        match ($tournament->status) {
            'draft' => $this->post(
                $organizer, $tournament,
                "Coming soon: {$tournament->name}",
                "We're finalizing the details for {$tournament->name} ({$sportName}). Registration hasn't opened yet — follow this space for the official announcement.",
                null,
                collect()
            ),
            'registration' => $this->post(
                $organizer, $tournament,
                "Registration is open: {$tournament->name}",
                "{$tournament->name} is now accepting registrations{$where}. Coaches, get your rosters ready — spots are filling up fast!",
                now()->subDays(rand(1, 5)),
                $engagementPool
            ),
            'preparation' => $this->post(
                $organizer, $tournament,
                "Bracket is set for {$tournament->name}",
                "Registration has closed and the bracket for {$tournament->name} is locked in{$where}. Good luck to everyone who signed up — matches begin soon!",
                now()->subDays(rand(1, 3)),
                $engagementPool
            ),
            'ongoing' => $this->post(
                $organizer, $tournament,
                "{$tournament->name} is underway!",
                "Matches are live for {$tournament->name}{$where}. Catch the bracket in the app to follow every score in real time and see who advances next.",
                now()->subDays(rand(1, 4)),
                $engagementPool
            ),
            'completed' => $this->postCompletedTournament($organizer, $tournament, $where, $engagementPool),
            'cancelled' => $this->post(
                $organizer, $tournament,
                "{$tournament->name} has been cancelled",
                "Due to unforeseen circumstances, {$tournament->name} has been cancelled. Apologies for the inconvenience — we hope to see everyone at the next one!",
                now()->subDays(1),
                $engagementPool
            ),
            default => null,
        };
    }

    private function postCompletedTournament(User $organizer, Tournament $tournament, string $where, Collection $engagementPool): void
    {
        $this->post(
            $organizer, $tournament,
            "{$tournament->name} has wrapped up!",
            "Every match has been played for {$tournament->name}{$where}. Thanks to every team and player who joined — see the final results in the bracket.",
            ($tournament->ends_at ?? $tournament->starts_at)?->copy()->addHours(3) ?? now()->subDays(2),
            $engagementPool
        );

        $championName = $tournament->championTeam?->name ?? $tournament->champion?->name;

        if ($championName) {
            $this->post(
                $organizer, $tournament,
                "Congratulations, {$championName}! 🏆",
                "{$championName} is your {$tournament->name} champion! A hard-fought run from every participant — thank you all for making this tournament one to remember.",
                ($tournament->ends_at ?? $tournament->starts_at)?->copy()->addHours(4) ?? now()->subDays(1),
                $engagementPool
            );
        }
    }

    /** @param  Collection<int, User>  $engagementPool */
    private function post(
        User $author,
        ?Tournament $tournament,
        string $title,
        string $body,
        ?Carbon $publishedAt,
        Collection $engagementPool,
        ?string $coverImageUrl = null,
    ): News {
        $news = News::create([
            'author_id' => $author->id,
            'tournament_id' => $tournament?->id,
            'title' => $title,
            'body' => $body,
            'cover_image_url' => $coverImageUrl,
            'published_at' => $publishedAt,
        ]);

        // Unpublished (draft-tournament teaser) posts don't get engagement —
        // nobody outside the organizer can see them yet.
        if ($publishedAt !== null) {
            $this->addEngagement($news, $engagementPool);
        }

        return $news;
    }

    /** @param  Collection<int, User>  $pool */
    private function addEngagement(News $news, Collection $pool): void
    {
        if ($pool->isEmpty()) {
            return;
        }

        $reactorCount = min($pool->count(), rand(4, 12));
        foreach ($pool->shuffle()->take($reactorCount) as $reactor) {
            NewsReaction::firstOrCreate(['news_id' => $news->id, 'user_id' => $reactor->id]);
        }

        $commenterCount = min($pool->count(), rand(1, 4));
        foreach ($pool->shuffle()->take($commenterCount) as $commenter) {
            NewsComment::create([
                'news_id' => $news->id,
                'user_id' => $commenter->id,
                'body' => self::COMMENT_TEMPLATES[array_rand(self::COMMENT_TEMPLATES)],
            ]);
        }
    }
}
