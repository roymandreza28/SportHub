<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Relations\Pivot;

// A custom pivot model purely so these columns get a real `datetime` cast —
// the bare pivot Laravel builds automatically from withPivot() alone
// returns each of these as the raw DB string (e.g. "2026-09-19 21:36:39",
// no timezone marker), which every browser's `new Date(...)` then
// misparses as LOCAL time instead of UTC. In a timezone ahead of UTC that
// makes a just-muted conversation look ALREADY EXPIRED (Date.parse shifts
// it hours into the past) the instant the page re-reads it, and did the
// same to last_read_at's own unread-detection math even before mute/
// archive/hide/block existed. The `datetime` cast serializes through
// Carbon's default toJSON() instead, which is unambiguous ISO 8601 UTC
// (a trailing "Z"), so every consumer parses it correctly regardless of
// its own local timezone.
class ConversationParticipant extends Pivot
{
    protected $casts = [
        'joined_at' => 'datetime',
        'last_read_at' => 'datetime',
        'muted_until' => 'datetime',
        'archived_at' => 'datetime',
        'hidden_at' => 'datetime',
        'blocked_at' => 'datetime',
    ];
}
