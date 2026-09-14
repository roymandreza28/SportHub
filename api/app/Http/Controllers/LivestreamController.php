<?php

namespace App\Http\Controllers;

use App\Events\PublicSignalRelayed;
use App\Events\WebRTCSignalSent;
use App\Models\GameMatch;
use App\Models\Livestream;
use App\Models\News;
use App\Models\Tournament;
use App\Support\Broadcasting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class LivestreamController extends Controller
{
    public function index()
    {
        return Livestream::with(['broadcaster:id,name', 'tournament:id,organizer_id', 'match:id,participant_a_team_id,participant_b_team_id'])
            ->orderByDesc('created_at')->get();
    }

    public function show(Livestream $livestream)
    {
        return $livestream->load(['broadcaster:id,name', 'tournament:id,organizer_id', 'match:id,participant_a_team_id,participant_b_team_id']);
    }

    public function store(Request $request)
    {
        $this->authorize('create', Livestream::class);

        $data = $request->validate([
            'news_id' => ['nullable', 'exists:news,id'],
            'tournament_id' => ['nullable', 'exists:tournaments,id'],
            'match_id' => ['nullable', 'exists:matches,id'],
            'title' => ['required', 'string', 'max:255'],
        ]);

        $user = $request->user();
        $broadcasterId = $user->id;
        $tournament = null;

        // Matches have no tournament_id column of their own (see
        // GameMatch->bracket->tournament) — a match-scoped stream always
        // resolves ITS tournament through the match, and that resolved id is
        // what gets persisted below, regardless of any tournament_id the
        // client also sent. Keeping tournament_id populated this way means
        // every consumer that only ever checked livestream.tournament_id /
        // tournament->organizer_id (LivestreamPolicy, publish(), the
        // broadcaster/viewer components) keeps working unchanged.
        if (! empty($data['match_id'])) {
            $match = GameMatch::with('bracket.tournament')->findOrFail($data['match_id']);
            $tournament = $match->bracket->tournament;
            abort_unless($tournament !== null, 404);
            $data['tournament_id'] = $tournament->id;
        }

        if (! empty($data['tournament_id'])) {
            $tournament = $tournament ?? Tournament::findOrFail($data['tournament_id']);
            abort_unless(
                $tournament->organizer_id === $user->id || $tournament->livestream_organizer_id === $user->id,
                403
            );
            // The livestream_organizer assigned to this tournament is the one
            // whose device camera actually feeds the stream, even if the main
            // organizer is the one who created the Livestream row.
            $broadcasterId = $tournament->livestream_organizer_id ?? $user->id;
        }

        if (! empty($data['news_id'])) {
            abort_unless(News::findOrFail($data['news_id'])->author_id === $user->id, 403);
        }

        // One livestream per GAME now, not per tournament — several courts
        // running at once in the same tournament can each have their own
        // broadcast. Going live again for the SAME match (after ending the
        // first broadcast, a dropped-connection retry, a second half) still
        // reuses that match's existing row instead of leaving the old one's
        // recording sitting next to a new row — same reuse rationale the
        // tournament-wide key always had, just keyed one level down. A
        // stream created with no match_id at all (a legacy whole-tournament
        // broadcast, or one not tied to any bracket) keeps being keyed by
        // tournament_id; one with neither key always gets a fresh row.
        $uniqueKey = ! empty($data['match_id'])
            ? ['match_id' => $data['match_id']]
            : (! empty($data['tournament_id']) ? ['tournament_id' => $data['tournament_id']] : null);

        if ($uniqueKey !== null) {
            $existing = Livestream::where($uniqueKey)->first();

            $livestream = Livestream::updateOrCreate(
                $uniqueKey,
                [
                    'tournament_id' => $data['tournament_id'] ?? $existing?->tournament_id,
                    // Keeps whichever News post this game was already
                    // published under (if any) linked to the new broadcast,
                    // rather than wiping the connection a prior publish()
                    // made.
                    'news_id' => $data['news_id'] ?? $existing?->news_id,
                    'title' => $data['title'],
                    'broadcaster_id' => $broadcasterId,
                    'chat_channel_name' => $existing?->chat_channel_name ?? 'livestream.'.Str::random(12),
                    'status' => 'scheduled',
                ]
            );
        } else {
            $livestream = Livestream::create([
                ...$data,
                'broadcaster_id' => $broadcasterId,
                'chat_channel_name' => 'livestream.'.Str::random(12),
                'status' => 'scheduled',
            ]);
        }

        return response()->json($livestream->load(['broadcaster:id,name', 'tournament:id,organizer_id', 'match:id,participant_a_team_id,participant_b_team_id']), 201);
    }

    public function update(Request $request, Livestream $livestream)
    {
        $this->authorize('update', $livestream);

        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:255'],
            'status' => ['sometimes', 'in:scheduled,live,ended'],
        ]);

        $livestream->update($data);

        return $livestream;
    }

    // The broadcaster's device uploads its own MediaRecorder capture right
    // after stopBroadcast() — same "update this livestream" ability as
    // status/title changes, since recording a copy of your own broadcast is
    // just another thing the broadcaster (or the main organizer who owns
    // the tournament it's tied to) can do to it. One recording per
    // livestream: re-uploading (e.g. a retry after a dropped connection)
    // replaces the old file rather than orphaning it on disk.
    public function uploadRecording(Request $request, Livestream $livestream)
    {
        $this->authorize('update', $livestream);

        $data = $request->validate([
            // MediaRecorder's default output is webm; Safari's is mp4 —
            // both accepted since the broadcaster's browser dictates this,
            // not the viewer's. Capped well under a typical match's length
            // at a modest bitrate, but generous enough for a full game.
            'video' => ['required', 'file', 'mimetypes:video/webm,video/mp4', 'max:512000'],
        ]);

        if ($livestream->recording_path) {
            Storage::disk('public')->delete($livestream->recording_path);
        }

        $path = $request->file('video')->store('livestreams/'.$livestream->id, 'public');
        $livestream->update(['recording_path' => $path]);

        return $livestream->fresh();
    }

    public function destroy(Livestream $livestream)
    {
        $this->authorize('delete', $livestream);

        $livestream->delete();

        return response()->noContent();
    }

    // WebRTC signaling relay — the actual offer/answer/ICE-candidate payloads
    // are opaque to the backend, just forwarded to the target user's own
    // private channel (see WebRTCSignalSent). Open to any authenticated user,
    // matching the existing "any viewer can join a livestream's chat" rule —
    // there's no separate "viewer list" to check against.
    public function signal(Request $request, Livestream $livestream)
    {
        $data = $request->validate([
            'target_user_id' => ['required', 'integer', 'exists:users,id'],
            'type' => ['required', 'in:offer,answer,ice-candidate,broadcast-started,broadcast-ended'],
            // `present` not `required` — a broadcast-started/broadcast-ended
            // signal legitimately carries no payload, and Laravel's
            // `required` rule treats an empty array as "missing".
            'data' => ['present', 'array'],
        ]);

        $user = $request->user();

        if ($user->id === $livestream->broadcaster_id) {
            if ($data['type'] === 'broadcast-started') {
                $livestream->update(['status' => 'live']);
            } elseif ($data['type'] === 'broadcast-ended') {
                $livestream->update(['status' => 'ended']);
            }
        }

        Broadcasting::safely(fn () => WebRTCSignalSent::dispatch(
            $livestream, $user, (int) $data['target_user_id'], $data['type'], $data['data']
        ));

        return response()->noContent();
    }

    // The main organizer's "go live to the newsfeed" action — creates the
    // News article (title + context) and links this livestream to it via
    // news_id, which is what makes it show up in both the authenticated
    // Newsfeed and the public tabloid modal, and is what unlocks hop 2 of
    // the relay (publicSignal() below refuses to relay an unpublished feed).
    public function publish(Request $request, Livestream $livestream)
    {
        $user = $request->user();

        abort_unless(
            $livestream->tournament && $livestream->tournament->organizer_id === $user->id,
            403
        );

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'body' => ['required', 'string'],
        ]);

        $livestream = DB::transaction(function () use ($user, $data, $livestream) {
            $news = $user->news()->create([
                'title' => $data['title'],
                'body' => $data['body'],
                'published_at' => now(),
            ]);

            $livestream->update(['news_id' => $news->id]);

            return $livestream;
        });

        return $livestream->fresh()->load(['broadcaster:id,name', 'tournament:id,organizer_id', 'news']);
    }

    // Hop 2 signaling relay (main organizer -> every newsfeed viewer,
    // logged-in or fully anonymous) — deliberately unauthenticated, since
    // anonymous visitors on the public tabloid modal need to reach it too.
    // Every subscriber on the public channel filters by from_token/
    // target_token client-side (see PublicSignalRelayed) rather than this
    // endpoint addressing anyone directly, so there's no per-viewer identity
    // to check here — only that the livestream is actually a live, published
    // broadcast, so this can't be used as an open relay for anything else.
    public function publicSignal(Request $request, Livestream $livestream)
    {
        abort_unless($livestream->news_id !== null && $livestream->status === 'live', 404);

        $data = $request->validate([
            'from_token' => ['required', 'string', 'max:100'],
            'target_token' => ['required', 'string', 'max:100'],
            'type' => ['required', 'in:join,offer,answer,ice-candidate'],
            'data' => ['present', 'array'],
        ]);

        Broadcasting::safely(fn () => PublicSignalRelayed::dispatch(
            $livestream, $data['from_token'], $data['target_token'], $data['type'], $data['data']
        ));

        return response()->noContent();
    }
}
