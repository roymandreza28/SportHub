<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class ConversationMessage extends Model
{
    protected $fillable = [
        'conversation_id',
        'user_id',
        'body',
        'attachment_path',
        'removed_at',
        'reply_to_message_id',
        'forwarded_from_message_id',
        'pinned_at',
    ];

    protected $appends = ['attachment_url'];

    protected function casts(): array
    {
        return [
            // Real `datetime` casts, not the raw DB string — see
            // ConversationParticipant's own comment on why a bare
            // "2026-09-19 21:36:39" (no timezone marker) gets misparsed as
            // LOCAL time by every browser's `new Date(...)`. Not load-
            // bearing for removed_at/pinned_at the way it was for
            // muted_until (neither is compared against `Date.now()` client-
            // side), but there's no reason to leave the same footgun
            // sitting there for whatever reads them next.
            'removed_at' => 'datetime',
            'pinned_at' => 'datetime',
        ];
    }

    protected function attachmentUrl(): Attribute
    {
        return Attribute::get(fn () => $this->attachment_path ? Storage::disk('public')->url($this->attachment_path) : null);
    }

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function replyTo(): BelongsTo
    {
        return $this->belongsTo(self::class, 'reply_to_message_id');
    }

    public function forwardedFrom(): BelongsTo
    {
        return $this->belongsTo(self::class, 'forwarded_from_message_id');
    }
}
