<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class News extends Model
{
    protected $table = 'news';

    protected $fillable = ['author_id', 'tournament_id', 'title', 'body', 'cover_image_url', 'published_at'];

    protected function casts(): array
    {
        return [
            'published_at' => 'datetime',
        ];
    }

    public function author(): BelongsTo
    {
        return $this->belongsTo(User::class, 'author_id');
    }

    public function tournament(): BelongsTo
    {
        return $this->belongsTo(Tournament::class);
    }

    public function livestreams(): HasMany
    {
        return $this->hasMany(Livestream::class);
    }

    public function comments(): HasMany
    {
        return $this->hasMany(NewsComment::class);
    }

    public function reactions(): HasMany
    {
        return $this->hasMany(NewsReaction::class);
    }

    public function media(): HasMany
    {
        return $this->hasMany(NewsMedia::class)->orderBy('position');
    }
}
