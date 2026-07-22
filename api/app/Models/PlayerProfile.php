<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PlayerProfile extends Model
{
    protected $fillable = ['user_id', 'bio', 'date_of_birth', 'primary_sport_id'];

    protected function casts(): array
    {
        return [
            'date_of_birth' => 'date',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function primarySport(): BelongsTo
    {
        return $this->belongsTo(Sport::class, 'primary_sport_id');
    }

    public function skillLevels(): HasMany
    {
        return $this->hasMany(SkillLevel::class);
    }
}
