<?php

namespace App\Http\Controllers;

use App\Models\News;
use App\Models\NewsReaction;
use App\Models\Tournament;
use App\Models\User;
use App\Support\NewsMediaStorage;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class NewsController extends Controller
{
    public function index(Request $request)
    {
        $news = News::whereNotNull('published_at')
            ->with(['author:id,name', 'author.roles:id,name', 'media', 'livestreams:id,news_id,title,status', 'tournament:id,name,sport_id,sport_format_id'])
            ->withCount(['comments', 'reactions'])
            ->orderByDesc('published_at')
            ->get();

        $this->flagOrganizerAuthors($news);

        return $this->withViewerReaction($news, $request->user());
    }

    public function show(Request $request, News $news)
    {
        $news->load('author:id,name', 'author.roles:id,name', 'livestreams', 'media', 'tournament:id,name,sport_id,sport_format_id')
            ->loadCount(['comments', 'reactions']);

        $this->flagOrganizerAuthors(collect([$news]));

        return $this->withViewerReaction(collect([$news]), $request->user())->first();
    }

    // The reading feed (Newsfeed.tsx / the public landing modal) hides an
    // organizer's personal name in favor of a generic "Organizer" byline —
    // these are read as official tournament/venue announcements, not
    // personal posts. The true name still ships in the response (the
    // organizer's own admin post list reuses this same endpoint and needs
    // it for attribution) — only this flag drives the swap, client-side.
    private function flagOrganizerAuthors(Collection $items): void
    {
        $items->each(function (News $news) {
            $news->author->is_organizer = $news->author->roles->contains('name', 'organizer');
            $news->author->makeHidden('roles');
        });
    }

    // Player/coach Newsfeed cards need to know whether the viewer has
    // already reacted (to render the button as toggled-on) without shipping
    // every reaction row to the client — one query for all the ids on the
    // page beats one query per article.
    private function withViewerReaction(Collection $items, ?User $viewer): Collection
    {
        $reactedNewsIds = $viewer
            ? NewsReaction::where('user_id', $viewer->id)->whereIn('news_id', $items->pluck('id'))->pluck('news_id')->all()
            : [];

        return $items->each(fn (News $news) => $news->viewer_has_reacted = in_array($news->id, $reactedNewsIds, true));
    }

    public function store(Request $request)
    {
        $this->authorize('create', News::class);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'body' => ['required', 'string'],
            'cover_image_url' => ['nullable', 'string', 'max:500'],
            'published_at' => ['nullable', 'date'],
            // Set by ChampionCongratsModal to tag a post back to the tournament
            // it celebrates — ownership checked below rather than in a rule
            // closure since it needs the authenticated user, not just the value.
            'tournament_id' => ['nullable', 'exists:tournaments,id'],
            'media' => ['nullable', 'array', 'max:6'],
            // mimetypes checks the file's real content type, not just its
            // extension. Size is capped well below PHP's post_max_size so a
            // couple of attachments together don't get silently truncated
            // before Laravel's own validation ever runs.
            'media.*' => [
                'file',
                'mimetypes:image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime',
                'max:15360',
            ],
        ]);

        if (isset($data['tournament_id']) && Tournament::find($data['tournament_id'])?->organizer_id !== $request->user()->id) {
            abort(403, 'You do not organize this tournament.');
        }

        $news = DB::transaction(function () use ($request, $data) {
            $news = $request->user()->news()->create([
                'title' => $data['title'],
                'body' => $data['body'],
                'cover_image_url' => $data['cover_image_url'] ?? null,
                'published_at' => $data['published_at'] ?? now(),
                'tournament_id' => $data['tournament_id'] ?? null,
            ]);

            NewsMediaStorage::store($news, $request->file('media', []));

            return $news;
        });

        return response()->json($news->load('media', 'author:id,name'), 201);
    }

    public function update(Request $request, News $news)
    {
        $this->authorize('update', $news);

        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:255'],
            'body' => ['sometimes', 'string'],
            'cover_image_url' => ['nullable', 'string', 'max:500'],
            'published_at' => ['nullable', 'date'],
        ]);

        $news->update($data);

        return $news;
    }

    public function destroy(News $news)
    {
        $this->authorize('delete', $news);

        foreach ($news->media as $media) {
            Storage::disk('public')->delete($media->path);
        }

        $news->delete();

        return response()->noContent();
    }

}
