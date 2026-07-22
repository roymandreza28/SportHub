<?php

namespace App\Http\Controllers;

use App\Models\Tournament;
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
}
