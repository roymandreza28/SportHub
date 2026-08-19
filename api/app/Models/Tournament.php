<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Tournament extends Model
{
    protected $fillable = [
        'organizer_id', 'sport_id', 'sport_format_id', 'name', 'format', 'starts_at', 'ends_at', 'venue_id', 'status',
        'venue_organizer_id', 'livestream_organizer_id', 'scoring_type', 'sets_to_win',
        'champion_id', 'champion_team_id',
    ];

    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
        ];
    }

    public function organizer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'organizer_id');
    }

    public function sport(): BelongsTo
    {
        return $this->belongsTo(Sport::class);
    }

    // Set only for a team tournament — the format (e.g. Basketball 5v5) that
    // registrations/matches must use. Null means every registration/match
    // slot is an individual player, unchanged from before teams existed.
    public function sportFormat(): BelongsTo
    {
        return $this->belongsTo(SportFormat::class);
    }

    public function venue(): BelongsTo
    {
        return $this->belongsTo(Venue::class);
    }

    // Assigned per-tournament by the main organizer — runs the scoreboard
    // for this tournament specifically, not any tournament.
    public function venueOrganizer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'venue_organizer_id');
    }

    // Assigned per-tournament by the main organizer — feeds camera footage
    // into this tournament's livestream specifically, not any tournament.
    public function livestreamOrganizer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'livestream_organizer_id');
    }

    public function registrations(): HasMany
    {
        return $this->hasMany(TournamentRegistration::class);
    }

    public function bracket(): HasOne
    {
        return $this->hasOne(Bracket::class);
    }

    public function livestreams(): HasMany
    {
        return $this->hasMany(Livestream::class);
    }

    // Two posts can exist over a tournament's life: the creation
    // announcement and the completion congratulations — see
    // TournamentController::store() and ChampionCongratsModal's publish flow.
    public function news(): HasMany
    {
        return $this->hasMany(News::class);
    }

    public function champion(): BelongsTo
    {
        return $this->belongsTo(User::class, 'champion_id');
    }

    public function championTeam(): BelongsTo
    {
        return $this->belongsTo(Team::class, 'champion_team_id');
    }
}
