<?php

namespace App\Http\Controllers;

use App\Models\Tournament;
use App\Models\TournamentRegistration;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class TournamentRegistrationController extends Controller
{
    public function store(Request $request, Tournament $tournament)
    {
        $this->authorize('create', TournamentRegistration::class);

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

        return response()->json($registration->load('user:id,name,email', 'tournament:id,name'), 201);
    }
}
