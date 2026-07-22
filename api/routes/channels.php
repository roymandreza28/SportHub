<?php

use App\Models\Venue;
use Illuminate\Support\Facades\Broadcast;

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
