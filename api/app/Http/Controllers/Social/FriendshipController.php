<?php

namespace App\Http\Controllers\Social;

use App\Events\FriendRequestAccepted;
use App\Events\FriendRequestSent;
use App\Http\Controllers\Controller;
use App\Models\Friendship;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class FriendshipController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();

        $asRequester = $user->friendshipsAsRequester()->where('status', 'accepted')
            ->with('addressee:id,name,email,avatar_path')->get()
            ->map(fn (Friendship $f) => ['friendship_id' => $f->id, 'user' => $f->addressee]);

        $asAddressee = $user->friendshipsAsAddressee()->where('status', 'accepted')
            ->with('requester:id,name,email,avatar_path')->get()
            ->map(fn (Friendship $f) => ['friendship_id' => $f->id, 'user' => $f->requester]);

        return $asRequester->concat($asAddressee)->values();
    }

    public function pending(Request $request)
    {
        $direction = $request->string('direction')->toString() ?: 'incoming';

        $query = $direction === 'outgoing'
            ? $request->user()->friendshipsAsRequester()
            : $request->user()->friendshipsAsAddressee();

        return $query->where('status', 'pending')
            ->with(['requester:id,name,email,avatar_path', 'addressee:id,name,email,avatar_path'])
            ->latest()
            ->get();
    }

    public function store(Request $request)
    {
        $this->authorize('create', Friendship::class);

        $data = $request->validate([
            'addressee_id' => ['required', 'integer', 'exists:users,id'],
        ]);

        $user = $request->user();
        $addressee = User::findOrFail($data['addressee_id']);

        abort_if($addressee->id === $user->id, 422, 'You cannot friend yourself.');
        abort_unless($addressee->hasAnyRole(['player', 'coach']), 422, 'That account cannot be friended.');

        return DB::transaction(function () use ($user, $addressee) {
            $pairKey = Friendship::pairKeyFor($user->id, $addressee->id);

            $friendship = Friendship::where('pair_key', $pairKey)->lockForUpdate()->first();

            if ($friendship) {
                abort_if($friendship->status === 'accepted', 422, 'You are already friends.');
                abort_if($friendship->status === 'pending', 422, 'A friend request already exists between you.');

                // status === 'declined' — resend, flipping direction to the new requester.
                $friendship->update([
                    'requester_id' => $user->id,
                    'addressee_id' => $addressee->id,
                    'status' => 'pending',
                ]);
            } else {
                $friendship = Friendship::create([
                    'requester_id' => $user->id,
                    'addressee_id' => $addressee->id,
                    'status' => 'pending',
                    'pair_key' => $pairKey,
                ]);
            }

            FriendRequestSent::dispatch($friendship->fresh(['requester']));

            return response()->json($friendship, 201);
        });
    }

    public function accept(Request $request, Friendship $friendship)
    {
        $this->authorize('respond', $friendship);

        $friendship->update(['status' => 'accepted']);

        FriendRequestAccepted::dispatch($friendship->fresh(['addressee']));

        return $friendship;
    }

    public function decline(Request $request, Friendship $friendship)
    {
        $this->authorize('respond', $friendship);

        $friendship->update(['status' => 'declined']);

        return response()->noContent();
    }

    public function destroy(Request $request, Friendship $friendship)
    {
        $this->authorize('delete', $friendship);

        $friendship->delete();

        return response()->noContent();
    }
}
