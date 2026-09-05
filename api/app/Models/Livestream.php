<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\Storage;

class Livestream extends Model
{
    protected $fillable = [
        'news_id', 'tournament_id', 'title', 'broadcaster_id', 'chat_channel_name', 'status', 'recording_path',
    ];

    protected $appends = ['recording_url'];

    // The broadcaster's own MediaRecorder capture of the whole broadcast,
    // uploaded once they stop (see LivestreamController::uploadRecording())
    // — lets a viewer who missed the live broadcast watch it afterward
    // (LiveRelayVideo.tsx falls back to this as a plain <video> once
    // status is 'ended', instead of the live WebRTC connection).
    protected function recordingUrl(): Attribute
    {
        return Attribute::get(fn () => $this->recording_path ? Storage::disk('public')->url($this->recording_path) : null);
    }

    public function news(): BelongsTo
    {
        return $this->belongsTo(News::class);
    }

    public function tournament(): BelongsTo
    {
        return $this->belongsTo(Tournament::class);
    }

    public function broadcaster(): BelongsTo
    {
        return $this->belongsTo(User::class, 'broadcaster_id');
    }

    public function chatMessages(): HasMany
    {
        return $this->hasMany(ChatMessage::class);
    }
}
