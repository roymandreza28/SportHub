<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class SkillLevel extends Model
{
    protected $fillable = ['player_profile_id', 'sport_id', 'coach_id', 'level', 'score', 'evaluated_at'];

    protected function casts(): array
    {
        return [
            'score' => 'decimal:2',
            'evaluated_at' => 'datetime',
        ];
    }

    public function playerProfile(): BelongsTo
    {
        return $this->belongsTo(PlayerProfile::class);
    }

    public function sport(): BelongsTo
    {
        return $this->belongsTo(Sport::class);
    }

    public function coach(): BelongsTo
    {
        return $this->belongsTo(User::class, 'coach_id');
    }

    public function evaluations(): HasMany
    {
        return $this->hasMany(Evaluation::class);
    }

    // The one evaluation whose attribute ratings/notes are still "current"
    // for this skill level — an older evaluation is locked history (see
    // EvaluationController::update()'s own doc comment), so this is always
    // the right one to read for display (e.g. the profile's skill radar
    // chart) without a caller having to know to sort/limit itself.
    public function latestEvaluation(): HasOne
    {
        return $this->hasOne(Evaluation::class)->latestOfMany();
    }
}
