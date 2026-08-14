<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\HasApiTokens;
use Spatie\Permission\Traits\HasRoles;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasApiTokens, HasFactory, HasRoles, Notifiable, SoftDeletes;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'is_active',
        'avatar_path',
        'cover_path',
    ];

    /**
     * @var list<string>
     */
    protected $appends = [
        'avatar_url',
        'cover_url',
    ];

    /**
     * @var array<string, mixed>
     */
    protected $attributes = [
        'is_active' => true,
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_active' => 'boolean',
        ];
    }

    protected function avatarUrl(): Attribute
    {
        return Attribute::get(fn () => $this->avatar_path ? Storage::disk('public')->url($this->avatar_path) : null);
    }

    protected function coverUrl(): Attribute
    {
        return Attribute::get(fn () => $this->cover_path ? Storage::disk('public')->url($this->cover_path) : null);
    }

    public function playerProfile(): HasOne
    {
        return $this->hasOne(PlayerProfile::class);
    }

    public function venues(): HasMany
    {
        return $this->hasMany(Venue::class, 'facilitator_id');
    }

    public function organizedTournaments(): HasMany
    {
        return $this->hasMany(Tournament::class, 'organizer_id');
    }

    public function venueRegistrations(): HasMany
    {
        return $this->hasMany(VenueRegistration::class);
    }

    public function matchmakingRequests(): HasMany
    {
        return $this->hasMany(MatchmakingRequest::class);
    }

    public function coachedSkillLevels(): HasMany
    {
        return $this->hasMany(SkillLevel::class, 'coach_id');
    }

    public function evaluationsGiven(): HasMany
    {
        return $this->hasMany(Evaluation::class, 'coach_id');
    }

    public function news(): HasMany
    {
        return $this->hasMany(News::class, 'author_id');
    }

    public function chatMessages(): HasMany
    {
        return $this->hasMany(ChatMessage::class);
    }

    // Deliberately shadows Notifiable's own notifications() (the built-in
    // polymorphic DatabaseNotification relation) — this app never calls
    // ->notify(), so there's no DatabaseNotification table or usage to
    // conflict with; this is the app's own simple per-user feed instead.
    public function notifications(): HasMany
    {
        return $this->hasMany(Notification::class);
    }

    public function friendshipsAsRequester(): HasMany
    {
        return $this->hasMany(Friendship::class, 'requester_id');
    }

    public function friendshipsAsAddressee(): HasMany
    {
        return $this->hasMany(Friendship::class, 'addressee_id');
    }

    public function friends(): Collection
    {
        $asRequester = $this->friendshipsAsRequester()->where('status', 'accepted')->with('addressee')->get()->pluck('addressee');
        $asAddressee = $this->friendshipsAsAddressee()->where('status', 'accepted')->with('requester')->get()->pluck('requester');

        return $asRequester->concat($asAddressee)->unique('id')->values();
    }

    public function isFriendsWith(User $other): bool
    {
        return Friendship::where('pair_key', Friendship::pairKeyFor($this->id, $other->id))
            ->where('status', 'accepted')
            ->exists();
    }

    public function friendshipWith(User $other): ?Friendship
    {
        return Friendship::where('pair_key', Friendship::pairKeyFor($this->id, $other->id))->first();
    }

    public function posts(): HasMany
    {
        return $this->hasMany(Post::class);
    }

    public function conversations(): BelongsToMany
    {
        return $this->belongsToMany(Conversation::class, 'conversation_participants')
            ->withPivot('joined_at', 'last_read_at');
    }
}
