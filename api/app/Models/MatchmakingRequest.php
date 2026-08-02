<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MatchmakingRequest extends Model
{
    protected $fillable = [
        'user_id', 'sport_id', 'sport_format_id', 'team_id', 'skill_level_id', 'venue_id', 'status',
        'preferred_start_at', 'preferred_end_at',
    ];

    protected function casts(): array
    {
        return [
            'preferred_start_at' => 'datetime',
            'preferred_end_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function sport(): BelongsTo
    {
        return $this->belongsTo(Sport::class);
    }

    public function skillLevel(): BelongsTo
    {
        return $this->belongsTo(SkillLevel::class);
    }

    public function venue(): BelongsTo
    {
        return $this->belongsTo(Venue::class);
    }

    public function sportFormat(): BelongsTo
    {
        return $this->belongsTo(SportFormat::class);
    }

    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class);
    }
}
