<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class GameMatch extends Model
{
    protected $table = 'matches';

    protected $fillable = [
        'bracket_id', 'round', 'group_number', 'bracket_type', 'bracket_position', 'participant_a_id', 'participant_b_id',
        'participant_a_team_id', 'participant_b_team_id', 'score_a', 'score_b', 'sets', 'status', 'court_id',
        'scheduled_at', 'winner_id', 'winner_team_id', 'won_by_default',
        'clock_seconds_remaining', 'clock_shot_seconds_remaining', 'clock_running', 'clock_period_label', 'clock_synced_at',
    ];

    protected function casts(): array
    {
        return [
            'scheduled_at' => 'datetime',
            'sets' => 'array',
            'won_by_default' => 'boolean',
            'clock_running' => 'boolean',
            'clock_synced_at' => 'datetime',
        ];
    }

    public function bracket(): BelongsTo
    {
        return $this->belongsTo(Bracket::class);
    }

    public function participantA(): BelongsTo
    {
        return $this->belongsTo(User::class, 'participant_a_id');
    }

    public function participantB(): BelongsTo
    {
        return $this->belongsTo(User::class, 'participant_b_id');
    }

    public function winner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'winner_id');
    }

    public function participantATeam(): BelongsTo
    {
        return $this->belongsTo(Team::class, 'participant_a_team_id');
    }

    public function participantBTeam(): BelongsTo
    {
        return $this->belongsTo(Team::class, 'participant_b_team_id');
    }

    public function winnerTeam(): BelongsTo
    {
        return $this->belongsTo(Team::class, 'winner_team_id');
    }

    public function court(): BelongsTo
    {
        return $this->belongsTo(Court::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(MatchEvent::class, 'match_id');
    }
}
