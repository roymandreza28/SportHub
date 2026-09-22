<?php

namespace Database\Seeders;

use App\Models\Team;
use App\Models\User;
use App\Services\InitialsBadgeGenerator;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

// Gives every seeded Team a logo and every seeded player/coach a profile
// photo, so a match card — in the newsfeed, the live scoreboard, and the
// bracket view, all three normalized through the same
// MatchParticipants::shape() — shows a face or crest instead of a bare
// name. Teams get a locally GD-rendered initials badge (there's no real
// team crest in this demo dataset, so a random stock photo would just be
// misleading); players/coaches get a real photo from the Pexels API, same
// source/storage pipeline NewsfeedSeeder already uses for post covers,
// falling back to the same initials-badge generator when that's
// unavailable (offline dev machine, no API key, rate-limited).
//
// Idempotent by design (unlike NewsfeedSeeder's delete-and-recreate-every-
// run posts): only fills in whichever teams/users don't already have one,
// so re-running `db:seed` never re-downloads or re-renders anything
// already set, and a team/user a later seeder run creates still picks one
// up the next time this one runs.
class TeamAndPlayerImagerySeeder extends Seeder
{
    public function run(): void
    {
        $this->seedTeamLogos();
        $this->seedPlayerAvatars();
    }

    private function seedTeamLogos(): void
    {
        foreach (Team::whereNull('logo_path')->with('sport')->get() as $team) {
            $initials = InitialsBadgeGenerator::initialsFor($team->name);
            $bytes = InitialsBadgeGenerator::generate("team-{$team->id}-{$team->name}", $initials, $team->sport?->name);
            $path = "teams/{$team->id}/logo.jpg";

            try {
                if (Storage::disk('public')->put($path, $bytes)) {
                    $team->update(['logo_path' => $path]);
                }
            } catch (\Throwable $e) {
                Log::warning("TeamAndPlayerImagerySeeder: failed to store logo for team #{$team->id}: {$e->getMessage()}");
            }
        }
    }

    private function seedPlayerAvatars(): void
    {
        $users = User::role('player')->get()->merge(User::role('coach')->get())
            ->unique('id')
            ->whereNull('avatar_path')
            ->load('playerProfile.primarySport');

        foreach ($users as $user) {
            $sportName = $user->playerProfile?->primarySport?->name;
            $bytes = $this->fetchStockPhoto($user, $sportName)
                ?? $this->renderFallbackAvatar($user, $sportName);

            if ($bytes === null) {
                continue;
            }

            $path = "avatars/{$user->id}/seed.jpg";

            try {
                if (Storage::disk('public')->put($path, $bytes)) {
                    $user->update(['avatar_path' => $path]);
                }
            } catch (\Throwable $e) {
                Log::warning("TeamAndPlayerImagerySeeder: failed to store avatar for user #{$user->id}: {$e->getMessage()}");
            }
        }
    }

    // Same rationale as NewsfeedSeeder's own SPORT_QUERIES: Pexels' curated
    // tagging actually returns what the query asks for. "player" (rather
    // than just the sport name) biases results toward photos with a person
    // in them instead of an empty court/ball product shot.
    private const SPORT_QUERIES = [
        'Basketball' => 'basketball player',
        'Volleyball' => 'volleyball player',
        'Badminton' => 'badminton player',
        'Pickleball' => 'pickleball player',
        'Tennis' => 'tennis player',
        'Table Tennis' => 'table tennis player',
    ];

    // One search per sport (+ a generic fallback), cached for the rest of
    // this seed run — same 40-photo-pool-per-query pattern as
    // NewsfeedSeeder::photoPool(), so this stays a handful of Pexels calls
    // total regardless of how many demo players there are.
    private array $photoPoolCache = [];

    private function fetchStockPhoto(User $user, ?string $sportName): ?string
    {
        $query = self::SPORT_QUERIES[$sportName] ?? 'athlete portrait';
        $pool = $this->photoPool($query);

        if ($pool === []) {
            return null;
        }

        // Deterministic per user (stable across reseeds), spread across the
        // pool so teammates in the same sport don't all get the same photo.
        $url = $pool[crc32($user->email) % count($pool)];

        try {
            $response = Http::timeout(12)->get($url);

            return $response->successful() ? $response->body() : null;
        } catch (\Throwable $e) {
            Log::warning("TeamAndPlayerImagerySeeder: Pexels image download failed for user #{$user->id}: {$e->getMessage()}");

            return null;
        }
    }

    /** @return string[] downloadable, pre-cropped 400x400 image URLs */
    private function photoPool(string $query): array
    {
        if (array_key_exists($query, $this->photoPoolCache)) {
            return $this->photoPoolCache[$query];
        }

        $apiKey = config('services.pexels.key');
        if (! $apiKey) {
            return $this->photoPoolCache[$query] = [];
        }

        try {
            $response = Http::timeout(12)
                ->withHeaders(['Authorization' => $apiKey])
                ->get('https://api.pexels.com/v1/search', ['query' => $query, 'per_page' => 40]);

            if (! $response->successful()) {
                Log::warning("TeamAndPlayerImagerySeeder: Pexels search failed for \"{$query}\": HTTP {$response->status()}");

                return $this->photoPoolCache[$query] = [];
            }

            $urls = collect($response->json('photos', []))
                ->map(fn ($photo) => "{$photo['src']['original']}?auto=compress&cs=tinysrgb&fit=crop&h=400&w=400")
                ->values()
                ->all();

            return $this->photoPoolCache[$query] = $urls;
        } catch (\Throwable $e) {
            Log::warning("TeamAndPlayerImagerySeeder: Pexels search failed for \"{$query}\": {$e->getMessage()}");

            return $this->photoPoolCache[$query] = [];
        }
    }

    // Only reached when the real-photo fetch above fails outright — a
    // locally-rendered initials badge still beats leaving a player with no
    // photo at all.
    private function renderFallbackAvatar(User $user, ?string $sportName): ?string
    {
        try {
            return InitialsBadgeGenerator::generate("user-{$user->id}-{$user->name}", InitialsBadgeGenerator::initialsFor($user->name), $sportName);
        } catch (\Throwable $e) {
            Log::warning("TeamAndPlayerImagerySeeder: fallback avatar render failed for user #{$user->id}: {$e->getMessage()}");

            return null;
        }
    }
}
