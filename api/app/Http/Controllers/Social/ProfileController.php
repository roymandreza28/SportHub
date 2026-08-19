<?php

namespace App\Http\Controllers\Social;

use App\Http\Controllers\Controller;
use App\Models\MatchPlayerStat;
use App\Models\User;
use App\Support\PlayerStatFieldSets;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class ProfileController extends Controller
{
    public function updateCover(Request $request)
    {
        $data = $request->validate([
            'cover' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
        ]);

        $user = $request->user();

        if ($user->cover_path) {
            Storage::disk('public')->delete($user->cover_path);
        }

        $user->update(['cover_path' => $request->file('cover')->store('covers/'.$user->id, 'public')]);

        return ['cover_url' => $user->fresh()->cover_url];
    }

    public function show(Request $request, User $user)
    {
        abort_unless($user->hasAnyRole(['player', 'coach']), 404);

        $viewer = $request->user();
        $status = 'none';
        $friendshipId = null;

        if ($viewer->id === $user->id) {
            $status = 'self';
        } else {
            $friendship = $viewer->friendshipWith($user);

            if ($friendship) {
                $friendshipId = $friendship->id;

                if ($friendship->status === 'accepted') {
                    $status = 'friends';
                } elseif ($friendship->status === 'pending') {
                    $status = $friendship->requester_id === $viewer->id ? 'pending_sent' : 'pending_received';
                }
                // A 'declined' friendship falls through to 'none', letting the
                // requester send a fresh request rather than being stuck forever.
            }
        }

        return [
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'roles' => $user->getRoleNames()->values(),
                'bio' => $user->playerProfile?->bio,
                'primary_sport' => $user->playerProfile?->primarySport?->name,
                'avatar_url' => $user->avatar_url,
                'cover_url' => $user->cover_url,
                'friends_count' => $user->friends()->count(),
            ],
            'friendship_status' => $status,
            'friendship_id' => $friendshipId,
        ];
    }

    // Career totals for the venue-organizer scoreboard's per-player stats
    // (see MatchController::upsertPlayerStats()), grouped by sport, powering
    // ProfilePage.tsx's stats pentagon. Only completed matches count, so a
    // career total never fluctuates mid-game.
    public function statSummary(User $user)
    {
        abort_unless($user->hasAnyRole(['player', 'coach']), 404);

        return MatchPlayerStat::where('user_id', $user->id)
            ->whereHas('match', fn ($q) => $q->where('status', 'completed'))
            ->with('sport:id,name')
            ->get()
            ->groupBy('sport_id')
            ->map(function ($rows) {
                $sportName = $rows->first()->sport->name;
                $fields = PlayerStatFieldSets::for($sportName) ?? [];
                $totals = array_fill_keys(array_column($fields, 'key'), 0);

                foreach ($rows as $row) {
                    foreach ($row->stats ?? [] as $key => $value) {
                        if (array_key_exists($key, $totals)) {
                            $totals[$key] += (int) $value;
                        }
                    }
                }

                return [
                    'sport_id' => $rows->first()->sport_id,
                    'sport_name' => $sportName,
                    'matches_played' => $rows->count(),
                    'totals' => $totals,
                    'pentagon_fields' => PlayerStatFieldSets::pentagonAxesFor($sportName),
                ];
            })
            ->values();
    }
}
