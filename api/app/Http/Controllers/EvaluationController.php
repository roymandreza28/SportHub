<?php

namespace App\Http\Controllers;

use App\Models\Evaluation;
use App\Models\User;
use Illuminate\Http\Request;

class EvaluationController extends Controller
{
    public function index(Request $request)
    {
        $this->authorize('viewAny', Evaluation::class);

        $data = $request->validate([
            'player_id' => ['required', 'exists:users,id'],
        ]);

        $player = User::findOrFail($data['player_id']);
        $profile = $player->playerProfile;

        if (! $profile) {
            return response()->json([]);
        }

        return Evaluation::whereIn('skill_level_id', $profile->skillLevels()->pluck('id'))
            ->with('coach:id,name', 'skillLevel.sport')
            ->orderByDesc('created_at')
            ->get();
    }

    public function store(Request $request)
    {
        $this->authorize('create', Evaluation::class);

        $data = $request->validate([
            'player_id' => ['required', 'exists:users,id'],
            'sport_id' => ['required', 'exists:sports,id'],
            'level' => ['required', 'in:beginner,intermediate,advanced,pro'],
            'score' => ['nullable', 'numeric', 'between:0,999.99'],
            'criteria' => ['nullable', 'array'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $player = User::findOrFail($data['player_id']);
        $profile = $player->playerProfile()->firstOrCreate([]);
        $coach = $request->user();

        $skillLevel = $profile->skillLevels()->updateOrCreate(
            ['sport_id' => $data['sport_id']],
            [
                'coach_id' => $coach->id,
                'level' => $data['level'],
                'score' => $data['score'] ?? null,
                'evaluated_at' => now(),
            ]
        );

        $evaluation = $skillLevel->evaluations()->create([
            'coach_id' => $coach->id,
            'criteria' => $data['criteria'] ?? null,
            'notes' => $data['notes'] ?? null,
        ]);

        return response()->json($evaluation->load('skillLevel.sport'), 201);
    }
}
