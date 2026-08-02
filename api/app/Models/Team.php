<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Team extends Model
{
    protected $fillable = ['sport_id', 'sport_format_id', 'captain_id', 'name', 'status'];

    public function sport(): BelongsTo
    {
        return $this->belongsTo(Sport::class);
    }

    public function sportFormat(): BelongsTo
    {
        return $this->belongsTo(SportFormat::class);
    }

    public function captain(): BelongsTo
    {
        return $this->belongsTo(User::class, 'captain_id');
    }

    public function members(): HasMany
    {
        return $this->hasMany(TeamMember::class);
    }

    public function matchmakingRequests(): HasMany
    {
        return $this->hasMany(MatchmakingRequest::class);
    }

    public function acceptedMemberCount(): int
    {
        return $this->members()->where('status', 'accepted')->count();
    }

    /**
     * Recomputes and persists whether the roster is full (accepted count ==
     * the format's players_per_side), following an invite response or a
     * member being removed.
     */
    public function refreshReadyStatus(): void
    {
        if ($this->status === 'disbanded') {
            return;
        }

        $isReady = $this->acceptedMemberCount() >= $this->sportFormat->players_per_side;

        $this->update(['status' => $isReady ? 'ready' : 'forming']);
    }
}
