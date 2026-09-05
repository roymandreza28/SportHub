<?php

namespace App\Http\Controllers;

use App\Models\GameMatch;
use App\Models\Livestream;
use App\Models\News;
use App\Models\NewsReaction;
use App\Models\Tournament;
use App\Models\User;
use App\Support\MatchParticipants;
use App\Support\NewsMediaStorage;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class NewsController extends Controller
{
    private const MATCH_RELATION = [
        'match.participantA:id,name', 'match.participantB:id,name', 'match.winner:id,name',
        'match.participantATeam:id,name', 'match.participantBTeam:id,name', 'match.winnerTeam:id,name',
    ];

    public function index(Request $request)
    {
        $news = News::whereNotNull('published_at')
            ->with([
                'author:id,name', 'author.roles:id,name', 'media', 'livestreams:id,news_id,title,status,recording_path',
                'tournament:id,name,sport_id,sport_format_id', ...self::MATCH_RELATION,
            ])
            ->withCount(['comments', 'reactions'])
            ->orderByDesc('published_at')
            ->get();

        $this->flagOrganizerAuthors($news);
        $this->shapeMatches($news);

        return $this->withViewerReaction($news, $request->user());
    }

    public function show(Request $request, News $news)
    {
        $news->load('author:id,name', 'author.roles:id,name', 'livestreams', 'media', 'tournament:id,name,sport_id,sport_format_id', ...self::MATCH_RELATION)
            ->loadCount(['comments', 'reactions']);

        $this->flagOrganizerAuthors(collect([$news]));
        $this->shapeMatches(collect([$news]));

        return $this->withViewerReaction(collect([$news]), $request->user())->first();
    }

    // A News.match is a plain GameMatch model with team-or-individual
    // relations loaded separately (participantA/participantATeam, etc.) —
    // MatchParticipants::shape() is the one place that already knows how to
    // normalize either shape to {id, name}, same as MatchController::respond()
    // does for the scoreboard/bracket. Appended as a plain array attribute
    // (not a real Eloquent attribute) purely for this response's JSON shape.
    private function shapeMatches(Collection $items): void
    {
        $items->each(function (News $news) {
            if (! $news->match) {
                return;
            }

            $match = $news->match;
            // Eloquent's toArray() merges relationsToArray() OVER
            // attributesToArray(), so a plain setAttribute('match', ...)
            // would get silently clobbered by the still-loaded GameMatch
            // relation of the same name — unset it first.
            $news->unsetRelation('match')->setAttribute('match', [
                'id' => $match->id,
                'status' => $match->status,
                'score_a' => $match->score_a,
                'score_b' => $match->score_b,
                'won_by_default' => $match->won_by_default,
                'clock_seconds_remaining' => $match->clock_seconds_remaining,
                'clock_shot_seconds_remaining' => $match->clock_shot_seconds_remaining,
                'clock_running' => $match->clock_running,
                'clock_period_label' => $match->clock_period_label,
                'clock_synced_at' => $match->clock_synced_at?->toIso8601String(),
                'participant_a' => MatchParticipants::shape($match->participant_a_team_id, $match->participantATeam, $match->participantA),
                'participant_b' => MatchParticipants::shape($match->participant_b_team_id, $match->participantBTeam, $match->participantB),
                'winner' => MatchParticipants::shape($match->winner_team_id, $match->winnerTeam, $match->winner),
            ]);
        });
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
            // Set by ShareMatchModal to tag a post to a specific ongoing/just-
            // finished game — lets the frontend render (and live-subscribe
            // to) that game's real-time score, see shapeMatches() above.
            'match_id' => ['nullable', 'exists:matches,id'],
            // The organizer's explicit pick from ShareMatchModal's livestream
            // picker (when more than one candidate exists, or to override
            // the single-stream auto-detect below) — ownership checked next
            // to the tournament_id/match_id checks below.
            'livestream_id' => ['nullable', 'exists:livestreams,id'],
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

        $match = null;

        if (isset($data['match_id'])) {
            $match = GameMatch::find($data['match_id']);
            if (! $match || $match->bracket->tournament->organizer_id !== $request->user()->id) {
                abort(403, 'You do not organize this match\'s tournament.');
            }
        }

        $pickedLivestream = null;

        if (isset($data['livestream_id'])) {
            $pickedLivestream = Livestream::find($data['livestream_id']);
            if (! $pickedLivestream || $pickedLivestream->tournament?->organizer_id !== $request->user()->id) {
                abort(403, 'You do not organize this livestream\'s tournament.');
            }
        }

        $news = DB::transaction(function () use ($request, $data, $match, $pickedLivestream) {
            $news = $request->user()->news()->create([
                'title' => $data['title'],
                'body' => $data['body'],
                'cover_image_url' => $data['cover_image_url'] ?? null,
                'published_at' => $data['published_at'] ?? now(),
                'tournament_id' => $data['tournament_id'] ?? null,
                'match_id' => $data['match_id'] ?? null,
            ]);

            NewsMediaStorage::store($news, $request->file('media', []));

            // Sharing a live game is a natural moment to also surface
            // whoever's broadcasting it — links this post to a livestream
            // the same way LivestreamController::publish() does the other
            // way around (news_id), so it renders with the same LIVE badge
            // + embedded player. An explicit pick from ShareMatchModal's
            // picker always wins; failing that, a lone still-unlinked live
            // stream on the match's tournament is linked automatically so
            // sharing still works with zero extra clicks in the common case
            // of exactly one broadcast running.
            if ($pickedLivestream) {
                $pickedLivestream->update(['news_id' => $news->id]);
            } elseif ($match) {
                Livestream::where('tournament_id', $match->bracket->tournament_id)
                    ->where('status', 'live')
                    ->whereNull('news_id')
                    ->first()
                    ?->update(['news_id' => $news->id]);
            }

            return $news;
        });

        $news->load('media', 'author:id,name', 'livestreams:id,news_id,title,status,recording_path', ...self::MATCH_RELATION);
        $this->shapeMatches(collect([$news]));

        return response()->json($news, 201);
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
