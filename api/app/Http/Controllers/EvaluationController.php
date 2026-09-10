<?php

namespace App\Http\Controllers;

use App\Models\Evaluation;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

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
            'level' => ['required', 'in:beginner,casual_player,developing_athlete,competitive_athlete,professional'],
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

    // Corrects an existing evaluation rather than logging a new one — for
    // fixing a typo or a misclicked level/score, not for recording updated
    // progress (that's a fresh POST, same as before, which keeps its own
    // history entry). Only the MOST RECENT evaluation for a given
    // skill_level can be edited: that's the one currently reflected in the
    // player's skill_levels row, so editing it can safely keep that row in
    // sync. An older evaluation is locked history — the current tier/score
    // it once set has since been superseded by a later evaluation, so
    // rewriting it wouldn't mean anything for the player's current state.
    public function update(Request $request, Evaluation $evaluation)
    {
        $this->authorize('update', $evaluation);

        $skillLevel = $evaluation->skillLevel;
        $latestId = $skillLevel->evaluations()->latest('id')->value('id');

        if ($latestId !== $evaluation->id) {
            throw ValidationException::withMessages([
                'evaluation' => ['Only the most recent evaluation for this sport can be edited — submit a new evaluation to record updated progress.'],
            ]);
        }

        $data = $request->validate([
            'level' => ['required', 'in:beginner,casual_player,developing_athlete,competitive_athlete,professional'],
            'score' => ['nullable', 'numeric', 'between:0,999.99'],
            'criteria' => ['sometimes', 'nullable', 'array'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $evaluation->update([
            // 'criteria' is left untouched when the request doesn't send it
            // at all (the frontend's quick-edit form only surfaces
            // level/score/notes, not the full attribute-ratings/stat-input
            // UI) rather than wiping out previously recorded detail.
            'criteria' => array_key_exists('criteria', $data) ? $data['criteria'] : $evaluation->criteria,
            'notes' => $data['notes'] ?? null,
        ]);

        $skillLevel->update([
            'level' => $data['level'],
            'score' => $data['score'] ?? null,
        ]);

        return $evaluation->fresh()->load('coach:id,name', 'skillLevel.sport');
    }
}
