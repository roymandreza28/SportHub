<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Court extends Model
{
    protected $fillable = ['venue_id', 'name', 'type', 'capacity', 'status', 'block_hours', 'block_price'];

    public function venue(): BelongsTo
    {
        return $this->belongsTo(Venue::class);
    }

    public function sports(): BelongsToMany
    {
        return $this->belongsToMany(Sport::class);
    }

    public function venueRegistrations(): HasMany
    {
        return $this->hasMany(VenueRegistration::class);
    }

    public function matches(): HasMany
    {
        return $this->hasMany(GameMatch::class, 'court_id');
    }
}
