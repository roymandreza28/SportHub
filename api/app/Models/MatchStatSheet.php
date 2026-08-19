<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MatchStatSheet extends Model
{
    protected $fillable = [
        'match_id', 'team_id', 'user_id', 'sport_id', 'filled_by_user_id', 'is_locked', 'locked_at', 'data',
    ];

    protected function casts(): array
    {
        return [
            'data' => 'array',
            'is_locked' => 'boolean',
            'locked_at' => 'datetime',
        ];
    }

    public function match(): BelongsTo
    {
        return $this->belongsTo(GameMatch::class, 'match_id');
    }

    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class);
    }

    // Set instead of (never alongside) team_id when this sheet belongs to an
    // individual participant — a racquet-sport singles match has no Team.
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function sport(): BelongsTo
    {
        return $this->belongsTo(Sport::class);
    }

    public function filledBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'filled_by_user_id');
    }
}
