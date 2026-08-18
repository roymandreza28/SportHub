<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

class VenueRegistration extends Model
{
    protected $fillable = [
        'venue_id', 'user_id', 'court_id', 'starts_at', 'ends_at', 'status', 'purpose',
        'walk_in_name', 'walk_in_contact',
    ];

    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
        ];
    }

    // A booking blocks the slot it's on: a venue-wide booking (no specific
    // court) blocks the entire venue, while a court-specific booking only
    // blocks that same court or an existing venue-wide booking. Shared by
    // both the player self-booking flow and the facilitator's manual
    // walk-in flow so they can never silently diverge.
    public static function hasOverlap(int $venueId, ?int $courtId, $startsAt, $endsAt): bool
    {
        return static::where('venue_id', $venueId)
            ->whereIn('status', ['pending', 'approved'])
            ->where('starts_at', '<', $endsAt)
            ->where('ends_at', '>', $startsAt)
            ->when($courtId, fn ($q) => $q->where(
                fn ($q2) => $q2->whereNull('court_id')->orWhere('court_id', $courtId)
            ))
            ->exists();
    }

    public function venue(): BelongsTo
    {
        return $this->belongsTo(Venue::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function court(): BelongsTo
    {
        return $this->belongsTo(Court::class);
    }

    public function conversation(): HasOne
    {
        return $this->hasOne(Conversation::class);
    }
}
