<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Livestream extends Model
{
    protected $fillable = [
        'news_id', 'tournament_id', 'title', 'platform', 'embed_url', 'chat_channel_name', 'status',
    ];

    public function news(): BelongsTo
    {
        return $this->belongsTo(News::class);
    }

    public function tournament(): BelongsTo
    {
        return $this->belongsTo(Tournament::class);
    }

    public function chatMessages(): HasMany
    {
        return $this->hasMany(ChatMessage::class);
    }
}
