<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SportFormat extends Model
{
    protected $fillable = ['sport_id', 'name', 'players_per_side'];

    public function sport(): BelongsTo
    {
        return $this->belongsTo(Sport::class);
    }
}
