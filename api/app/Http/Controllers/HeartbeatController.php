<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

// Every authenticated tab pings POST /api/heartbeat every ~25s (see
// web/src/lib/useHeartbeat.ts) — "online" everywhere in the UI is then just
// "last_seen_at is recent" (see chatApi.ts's isUserOnline()), not a raw
// stored flag, so a crashed tab or dropped connection ages out naturally
// instead of leaving someone stuck looking permanently online.
class HeartbeatController extends Controller
{
    public function touch(Request $request)
    {
        // A raw column update, not $user->save() — skips re-hashing the
        // password cast, touching updated_at, or firing model
        // observers/events for what is, by design, the highest-frequency
        // write any single user causes in this app.
        $request->user()->newQuery()->whereKey($request->user()->id)->update(['last_seen_at' => now()]);

        return response()->noContent();
    }
}
