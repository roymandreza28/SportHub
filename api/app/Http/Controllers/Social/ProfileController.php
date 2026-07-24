<?php

namespace App\Http\Controllers\Social;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;

class ProfileController extends Controller
{
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
            ],
            'friendship_status' => $status,
            'friendship_id' => $friendshipId,
        ];
    }
}
