<?php

namespace App\Http\Controllers;

use App\Models\Team;
use App\Models\Tournament;
use App\Models\TournamentRegistration;
use App\Services\NotificationService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class TournamentRegistrationController extends Controller
{
    public function mine(Request $request)
    {
        return TournamentRegistration::where('registered_by', $request->user()->id)
            ->with([
                'user:id,name,email',
                'team.members.user:id,name,email',
                'tournament' => fn ($q) => $q->with('sport', 'venue'),
            ])
            ->orderByDesc('created_at')
            ->get();
    }

    public function minePlayer(Request $request)
    {
        $userId = $request->user()->id;

        return TournamentRegistration::where('user_id', $userId)
            ->orWhereHas('team.members', fn ($q) => $q->where('user_id', $userId)->where('status', 'accepted'))
            ->with([
                'registeredBy:id,name',
                'team.members.user:id,name,email',
                'tournament' => fn ($q) => $q->with('sport', 'venue'),
            ])
            ->orderByDesc('created_at')
            ->get();
    }

    public function store(Request $request, Tournament $tournament)
    {
        $this->authorize('create', TournamentRegistration::class);

        abort_if(
            $request->user()->verification_status !== 'verified',
            403,
            "Your account is still under verification. You can't register a player for a tournament yet."
        );

        $data = $request->validate([
            'user_id' => ['required', 'exists:users,id'],
        ]);

        if (! in_array($tournament->status, ['draft', 'open'], true)) {
            throw ValidationException::withMessages(['tournament' => ['Registration is closed for this tournament.']]);
        }

        $alreadyRegistered = TournamentRegistration::where('tournament_id', $tournament->id)
            ->where('user_id', $data['user_id'])
            ->exists();

        if ($alreadyRegistered) {
            throw ValidationException::withMessages(['user_id' => ['This player is already registered for this tournament.']]);
        }

        $registration = TournamentRegistration::create([
            'tournament_id' => $tournament->id,
            'user_id' => $data['user_id'],
            'registered_by' => $request->user()->id,
            'status' => 'pending',
        ]);

        // Only notify when someone else did the registering (a coach
        // entering their player) — no need to tell a player they just
        // registered themselves.
        if ((int) $data['user_id'] !== $request->user()->id) {
            NotificationService::send($data['user_id'], 'tournament_update', [
                'tournament_id' => $tournament->id,
                'tournament_name' => $tournament->name,
                'message' => "You've been registered for {$tournament->name}.",
            ]);
        }

        return response()->json($registration->load('user:id,name,email', 'tournament:id,name'), 201);
    }

    public function storeTeam(Request $request, Tournament $tournament)
    {
        $this->authorize('create', TournamentRegistration::class);

        abort_if(
            $request->user()->verification_status !== 'verified',
            403,
            "Your account is still under verification. You can't register a team for a tournament yet."
        );

        $data = $request->validate([
            'team_id' => ['required', 'exists:teams,id'],
        ]);

        abort_if($tournament->sport_format_id === null, 422, 'This tournament does not use team registration.');

        if (! in_array($tournament->status, ['draft', 'open'], true)) {
            throw ValidationException::withMessages(['tournament' => ['Registration is closed for this tournament.']]);
        }

        $team = Team::findOrFail($data['team_id']);

        abort_unless($team->captain_id === $request->user()->id, 403, 'Only the team captain can register it.');
        abort_if(
            $team->sport_format_id !== $tournament->sport_format_id,
            422,
            'This team\'s format does not match the tournament\'s required format.'
        );
        abort_if($team->status !== 'ready', 422, 'This team is not full yet.');

        $alreadyRegistered = TournamentRegistration::where('tournament_id', $tournament->id)
            ->where('team_id', $team->id)
            ->exists();

        if ($alreadyRegistered) {
            throw ValidationException::withMessages(['team_id' => ['This team is already registered for this tournament.']]);
        }

        $registration = TournamentRegistration::create([
            'tournament_id' => $tournament->id,
            'team_id' => $team->id,
            'registered_by' => $request->user()->id,
            'status' => 'pending',
        ]);

        $team->load('members');
        foreach ($team->members->where('status', 'accepted') as $member) {
            NotificationService::send($member->user_id, 'tournament_update', [
                'tournament_id' => $tournament->id,
                'tournament_name' => $tournament->name,
                'message' => "Your team \"{$team->name}\" has been registered for {$tournament->name}.",
            ]);
        }

        return response()->json($registration->load('team.members.user:id,name,email', 'tournament:id,name'), 201);
    }
}
