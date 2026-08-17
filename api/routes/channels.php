<?php

use App\Models\Conversation;
use App\Models\Venue;
use Illuminate\Support\Facades\Broadcast;

// Overrides Laravel's default auto-registered /broadcasting/auth route,
// which uses the 'web' (session-cookie) guard — incompatible with the
// Bearer-token auth the frontend uses so login works across the Vercel/
// Render domain split. 'auth:sanctum' accepts the same token every other
// API request already sends.
Broadcast::routes(['middleware' => ['auth:sanctum']]);

Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});

// Player's own matchmaking status updates.
Broadcast::channel('matchmaking.{userId}', function ($user, $userId) {
    return (int) $user->id === (int) $userId;
});

// Facilitator-only: full registration detail (names/emails/purpose) for a venue they own.
Broadcast::channel('venue.{venueId}.schedule', function ($user, $venueId) {
    $venue = Venue::find($venueId);

    return $venue && ($venue->facilitator_id === $user->id || $user->hasRole('admin'));
});

// Player's own venue-registration status updates (approved/rejected), without
// exposing the rest of the venue's booking data to them.
Broadcast::channel('venue-registrations.user.{userId}', function ($user, $userId) {
    return (int) $user->id === (int) $userId;
});

// Presence channel: any authenticated viewer can join a livestream's chat.
Broadcast::channel('livestream.{livestreamId}.chat', function ($user, $livestreamId) {
    return ['id' => $user->id, 'name' => $user->name];
});

Broadcast::channel('admin.monitoring', function ($user) {
    return $user->hasRole('admin');
});

// Friend/group chat: only current participants may listen.
Broadcast::channel('conversation.{conversationId}', function ($user, $conversationId) {
    return Conversation::find($conversationId)
        ?->participants()->where('users.id', $user->id)->exists() ?? false;
});
