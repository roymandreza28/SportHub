<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class VenueMedia extends Model
{
    protected $fillable = ['venue_id', 'path', 'position'];

    protected $appends = ['url'];

    protected function url(): Attribute
    {
        return Attribute::get(fn () => Storage::disk('public')->url($this->path));
    }

    public function venue(): BelongsTo
    {
        return $this->belongsTo(Venue::class);
    }
}
