<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Sport extends Model
{
    protected $fillable = ['name', 'category'];

    public function playerProfiles(): HasMany
    {
        return $this->hasMany(PlayerProfile::class, 'primary_sport_id');
    }

    public function skillLevels(): HasMany
    {
        return $this->hasMany(SkillLevel::class);
    }

    public function tournaments(): HasMany
    {
        return $this->hasMany(Tournament::class);
    }

    public function courts(): BelongsToMany
    {
        return $this->belongsToMany(Court::class);
    }

    public function formats(): HasMany
    {
        return $this->hasMany(SportFormat::class);
    }
}
