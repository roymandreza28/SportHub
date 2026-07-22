<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Equipment extends Model
{
    protected $fillable = ['venue_id', 'name', 'quantity_total', 'quantity_available'];

    public function venue(): BelongsTo
    {
        return $this->belongsTo(Venue::class);
    }
}
