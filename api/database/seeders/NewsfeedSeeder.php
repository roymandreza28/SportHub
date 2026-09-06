<?php

namespace Database\Seeders;

use App\Models\News;
use App\Models\NewsComment;
use App\Models\NewsReaction;
use App\Models\Tournament;
use App\Models\User;
use App\Services\NewsCoverCardGenerator;
use Carbon\Carbon;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;

// Turns every tournament SampleDataSeeder/ExtendedTournamentsSeeder created
// into a newsfeed post (status-appropriate wording — a draft tournament gets
// an unpublished teaser, a completed one gets a champion congrats post too),
// plus a couple of standalone posts, then sprinkles reactions/comments from
// the seeded player/coach pool so the feed reads as a lived-in community
// rather than a fresh, empty table. Every post also gets a real cover photo —
// rendered locally per-post by NewsCoverCardGenerator (sport-colored
// gradient + icon + the post's own title/tournament name) rather than
// fetched from a stock-photo API, so every post's cover is unique to it and
// there's no external dependency at seed time — then stored through the
// same NewsMedia/public-disk pipeline NewsController::store() uses for a
// real uploaded photo, so Newsfeed.tsx's NewsMediaGrid renders it exactly
// like an organizer's own upload, not a dead cover_image_url field the UI
// never actually reads. News is organizer-authored only (see
// RolesAndPermissionsSeeder's 'manage news' permission), so every post here
// uses the one demo organizer account.
class NewsfeedSeeder extends Seeder
{
    // Bespoke, longer-form copy for the 5 flagship tournaments
    // ExtendedTournamentsSeeder builds out with full brackets/box scores —
    // keyed by exact Tournament::name so postForTournament() can swap this in
    // for the generic per-status template on just these, while every other
    // tournament (registration/draft/cancelled ones) still gets the generic
    // wording. Each entry mirrors the two status branches that actually fire
    // for these 5 (ongoing = still at the final, completed = champion
    // crowned) rather than covering every status, since none of these five
    // are ever draft/registration/preparation/cancelled.
    private const FLAGSHIP_STORIES = [
        'Binangonan Interbarangay Basketball Championship' => [
            'ongoing' => [
                'title' => 'Final four down, one game to go: Basketball Championship heads to the finals!',
                'body' => "Eight barangay teams. Four brutal quarterfinal matchups. Two semifinal thrillers. Now it's down to this: the Binangonan Interbarangay Basketball Championship has its finalists, and the whole gymnasium is buzzing.\n\nEvery quarterfinal and semifinal has been logged with a full player-by-player box score — points, rebounds, assists, steals, and blocks for every athlete who stepped on the court. Scroll through the bracket in the app to relive every possession, or check any player's profile to see how their stat line is stacking up this tournament.\n\nThe championship game tips off soon at the Binangonan Recreation and Conference Center's Main Court. Two barangays, one trophy — who's got next?",
            ],
        ],
        'Binangonan Volleyball Championship Cup' => [
            'ongoing' => [
                'title' => "Spikes, blocks, and dig after dig: Volleyball Championship Cup finalists are set!",
                'body' => "Four squads registered for the inaugural Binangonan Volleyball Championship Cup, and after two hard-fought, best-of-five semifinal battles, we're down to the final two.\n\nBoth semifinals went the distance in sets, with kills, blocks, aces, and digs tracked for every player on the court — the kind of detail that turns a rally into a real stat line on each athlete's profile. Rotations were tested, momentum swung set to set, and the two teams left standing have earned their spot in the final.\n\nThe championship match is set for the Volleyball Court at the Binangonan Recreation and Conference Center. Bring your voice — this one's going the distance.",
            ],
        ],
        'Binangonan Badminton Doubles Championship' => [
            'ongoing' => [
                'title' => "Smashes and net play all week: Badminton Doubles Championship reaches its final pairing",
                'body' => "Four doubles pairs entered the Binangonan Badminton Doubles Championship at JBTC Binangonan Badminton and Pickleball Courts, and the semifinals delivered exactly the kind of tight, tactical rallies this format is known for — smash winners, net kills, and aces recorded point-by-point for every pair.\n\nBoth semifinal ties were decided in sets, and the two pairings advancing to the final have shown they can handle the pressure of a best-of-three finish. Check the bracket for the full set-by-set breakdown of how each pair got here.\n\nThe final is coming up soon on Court 1 — expect a fast, physical finish.",
            ],
        ],
        'Binangonan Tennis Singles Championship' => [
            'completed' => [
                'title' => 'A champion has been crowned at the Binangonan Tennis Singles Championship!',
                'body' => "The Binangonan Tennis Singles Championship is complete. Four singles competitors battled through the semifinals and into a final that went the distance in sets, with aces, winners, and unforced errors tracked point-by-point for every match.\n\nFrom the first semifinal serve at Eastridge Athletic Park to the final's closing point, every match is now on record — check the bracket for the complete set-by-set history, or head to a competitor's profile to see their full tournament stat line.\n\nCongratulations to everyone who stepped on the court this tournament.",
            ],
        ],
        'Binangonan Table Tennis Doubles Championship' => [
            'completed' => [
                'title' => 'Champions crowned at the Binangonan Table Tennis Doubles Championship!',
                'body' => "The Binangonan Table Tennis Doubles Championship has concluded at the Recreation and Conference Center's Table Tennis Corner. Four doubles teams competed through the semifinals into a best-of-seven final, with every point-winning rally, service point, and unforced error logged for both sides of the table.\n\nIt was fast, it was close, and it's now fully on record — the complete set-by-set results are in the bracket, and each player's stat line has been added to their career totals.\n\nCongratulations to the newest doubles champions in Binangonan!",
            ],
        ],
    ];

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
        // duplicate/stale posts (and orphaned photo files) piling up across
        // repeated `db:seed` runs.
        foreach (News::all() as $stale) {
            Storage::disk('public')->deleteDirectory("news/{$stale->id}");
        }
        News::query()->delete();

        $engagementPool = User::role('player')->get()->merge(User::role('coach')->get())->shuffle();

        $this->post(
            $organizer, null,
            'Welcome to SportHub Binangonan! 🎉',
            "SportHub is now live for the whole municipality — browse open tournaments, book a court, or register your team in just a few taps. Say hello in the comments and let us know what sport you're most excited to see!",
            now()->subDays(10),
            $engagementPool
        );

        $this->post(
            $organizer, null,
            'Facility Update: New equipment at the Binangonan Recreation and Conference Center',
            'A fresh set of basketballs and volleyball equipment just arrived at the Binangonan Recreation and Conference Center, courtesy of our venue facilitator. Ballers, expect better grip and bounce consistency starting this week!',
            now()->subDays(8),
            $engagementPool
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
                $this->flagshipStory($tournament->name, 'ongoing')['title']
                    ?? "{$tournament->name} is underway!",
                $this->flagshipStory($tournament->name, 'ongoing')['body']
                    ?? "Matches are live for {$tournament->name}{$where}. Catch the bracket in the app to follow every score in real time and see who advances next.",
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
        $story = $this->flagshipStory($tournament->name, 'completed');

        $this->post(
            $organizer, $tournament,
            $story['title'] ?? "{$tournament->name} has wrapped up!",
            $story['body'] ?? "Every match has been played for {$tournament->name}{$where}. Thanks to every team and player who joined — see the final results in the bracket.",
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

    /** @return array{title: string, body: string}|null */
    private function flagshipStory(string $tournamentName, string $status): ?array
    {
        return self::FLAGSHIP_STORIES[$tournamentName][$status] ?? null;
    }

    /** @param  Collection<int, User>  $engagementPool */
    private function post(
        User $author,
        ?Tournament $tournament,
        string $title,
        string $body,
        ?Carbon $publishedAt,
        Collection $engagementPool,
    ): News {
        $news = News::create([
            'author_id' => $author->id,
            'tournament_id' => $tournament?->id,
            'title' => $title,
            'body' => $body,
            'published_at' => $publishedAt,
        ]);

        $this->attachCover($news, $title, $tournament?->sport?->name, $tournament?->name);

        // Unpublished (draft-tournament teaser) posts don't get engagement —
        // nobody outside the organizer can see them yet.
        if ($publishedAt !== null) {
            $this->addEngagement($news, $engagementPool);
        }

        return $news;
    }

    // Rendered locally by NewsCoverCardGenerator rather than fetched from a
    // stock-photo API — see this class's own doc comment for why. Wrapped in
    // a try/catch anyway: a missing GD extension or font on some unusual
    // environment shouldn't be able to fail the whole seed run, just leave
    // that one post without a cover.
    private function attachCover(News $news, string $title, ?string $sportName, ?string $tournamentName): void
    {
        try {
            $bytes = NewsCoverCardGenerator::generate($title, $sportName, $tournamentName);
            $path = "news/{$news->id}/cover.jpg";
            Storage::disk('public')->put($path, $bytes);

            $news->media()->create(['type' => 'image', 'path' => $path, 'position' => 0]);
        } catch (\Throwable) {
            // GD/font unavailable in this environment — skip the cover.
        }
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
