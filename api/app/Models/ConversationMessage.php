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
    ];

    protected $appends = ['attachment_url'];

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
}
