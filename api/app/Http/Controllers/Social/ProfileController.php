<?php

namespace App\Http\Controllers\Social;

use App\Http\Controllers\Controller;
use App\Models\User;
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
                'avatar_url' => $user->avatar_url,
                'cover_url' => $user->cover_url,
            ],
            'friendship_status' => $status,
            'friendship_id' => $friendshipId,
        ];
    }
}
