<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TournamentRegistration extends Model
{
    protected $fillable = ['tournament_id', 'user_id', 'team_id', 'registered_by', 'status'];

    public function tournament(): BelongsTo
    {
        return $this->belongsTo(Tournament::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    // Set instead of (never alongside) user_id when this registration is for
    // a team tournament.
    public function team(): BelongsTo
    {
        return $this->belongsTo(Team::class);
    }

    public function registeredBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'registered_by');
    }
}
