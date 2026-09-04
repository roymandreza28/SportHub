<?php

namespace App\Http\Controllers;

use App\Models\PushSubscription;
use Illuminate\Http\Request;

class PushSubscriptionController extends Controller
{
    // Registers (or reassigns, if this exact endpoint was already
    // subscribed — e.g. the same browser on a shared device logging in as
    // someone else) a device's push subscription to the current user.
    // Called with the browser's PushSubscription.toJSON() output directly,
    // hence the nested `keys.p256dh`/`keys.auth` shape rather than flat
    // columns.
    public function store(Request $request)
    {
        $data = $request->validate([
            'endpoint' => ['required', 'string', 'max:500'],
            'keys.p256dh' => ['required', 'string'],
            'keys.auth' => ['required', 'string'],
        ]);

        PushSubscription::updateOrCreate(
            ['endpoint' => $data['endpoint']],
            [
                'user_id' => $request->user()->id,
                'public_key' => $data['keys']['p256dh'],
                'auth_token' => $data['keys']['auth'],
            ]
        );

        return response()->noContent();
    }

    // Scoped to the current user's own subscriptions — a device unsubscribes
    // itself, never another user's.
    public function destroy(Request $request)
    {
        $data = $request->validate(['endpoint' => ['required', 'string']]);

        $request->user()->pushSubscriptions()->where('endpoint', $data['endpoint'])->delete();

        return response()->noContent();
    }
}
