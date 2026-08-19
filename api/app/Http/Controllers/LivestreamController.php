<?php

namespace App\Http\Controllers;

use App\Events\PublicSignalRelayed;
use App\Events\WebRTCSignalSent;
use App\Models\Livestream;
use App\Models\News;
use App\Models\Tournament;
use App\Support\Broadcasting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class LivestreamController extends Controller
{
    public function index()
    {
        return Livestream::with(['broadcaster:id,name', 'tournament:id,organizer_id'])
            ->orderByDesc('created_at')->get();
    }

    public function show(Livestream $livestream)
    {
        return $livestream->load(['broadcaster:id,name', 'tournament:id,organizer_id']);
    }

    public function store(Request $request)
    {
        $this->authorize('create', Livestream::class);

        $data = $request->validate([
            'news_id' => ['nullable', 'exists:news,id'],
            'tournament_id' => ['nullable', 'exists:tournaments,id'],
            'title' => ['required', 'string', 'max:255'],
        ]);

        $user = $request->user();
        $broadcasterId = $user->id;

        if (! empty($data['tournament_id'])) {
            $tournament = Tournament::findOrFail($data['tournament_id']);
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

        $livestream = Livestream::create([
            ...$data,
            'broadcaster_id' => $broadcasterId,
            'chat_channel_name' => 'livestream.'.Str::random(12),
            'status' => 'scheduled',
        ]);

        return response()->json($livestream->load(['broadcaster:id,name', 'tournament:id,organizer_id']), 201);
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
