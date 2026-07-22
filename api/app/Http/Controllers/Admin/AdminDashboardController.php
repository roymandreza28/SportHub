<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\GameMatch;
use App\Models\MatchmakingRequest;
use App\Models\Tournament;
use App\Models\Venue;
use App\Models\VenueRegistration;
use Spatie\Permission\Models\Role;

class AdminDashboardController extends Controller
{
    public function metrics()
    {
        return [
            'users_by_role' => Role::all()->mapWithKeys(fn (Role $role) => [$role->name => $role->users()->count()]),
            'total_venues' => Venue::count(),
            'total_tournaments' => Tournament::count(),
            'pending_venue_registrations' => VenueRegistration::where('status', 'pending')->count(),
            'open_matchmaking_requests' => MatchmakingRequest::where('status', 'open')->count(),
            'live_matches' => GameMatch::where('status', 'live')->count(),
        ];
    }
}
