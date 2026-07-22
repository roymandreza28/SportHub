<?php

namespace App\Http\Controllers;

use App\Models\Tournament;
use App\Services\BracketService;
use Illuminate\Http\Request;

class TournamentController extends Controller
{
    public function index(Request $request)
    {
        return Tournament::query()
            ->with('sport:id,name', 'venue:id,name')
            ->when($request->string('status')->toString(), fn ($q, $status) => $q->where('status', $status))
            ->orderByDesc('starts_at')
            ->get();
    }

    public function show(Tournament $tournament)
    {
        return $tournament->load('sport:id,name', 'venue:id,name', 'organizer:id,name');
    }

    public function store(Request $request)
    {
        $this->authorize('create', Tournament::class);

        $data = $request->validate([
            'sport_id' => ['required', 'exists:sports,id'],
            'name' => ['required', 'string', 'max:255'],
            'format' => ['required', 'in:single_elimination,double_elimination,round_robin'],
            'starts_at' => ['required', 'date'],
            'ends_at' => ['nullable', 'date', 'after:starts_at'],
            'venue_id' => ['nullable', 'exists:venues,id'],
        ]);

        $tournament = $request->user()->organizedTournaments()->create([
            ...$data,
            'status' => 'draft',
        ]);

        return response()->json($tournament->load('sport:id,name', 'venue:id,name'), 201);
    }

    public function update(Request $request, Tournament $tournament)
    {
        $this->authorize('update', $tournament);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'starts_at' => ['sometimes', 'date'],
            'ends_at' => ['nullable', 'date', 'after:starts_at'],
            'venue_id' => ['nullable', 'exists:venues,id'],
            'status' => ['sometimes', 'in:draft,open,in_progress,completed,cancelled'],
        ]);

        $tournament->update($data);

        return $tournament;
    }

    public function generateBracket(Tournament $tournament, BracketService $bracketService)
    {
        $this->authorize('generateBracket', $tournament);

        if ($tournament->bracket) {
            abort(422, 'This tournament already has a bracket.');
        }

        $bracket = $bracketService->generate($tournament);

        $tournament->update(['status' => 'in_progress']);

        return response()->json($bracket, 201);
    }

    public function bracket(Tournament $tournament)
    {
        $bracket = $tournament->bracket;

        if (! $bracket) {
            return response()->json(['message' => 'No bracket generated yet.'], 404);
        }

        return $bracket->load('matches.participantA:id,name', 'matches.participantB:id,name', 'matches.winner:id,name');
    }
}
