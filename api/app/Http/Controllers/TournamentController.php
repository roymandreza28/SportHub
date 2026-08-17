<?php

namespace App\Http\Controllers;

use App\Models\SportFormat;
use App\Models\Tournament;
use App\Models\User;
use App\Services\BracketService;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class TournamentController extends Controller
{
    public function index(Request $request, BracketService $bracketService)
    {
        $bracketService->autoStartExpired();

        return Tournament::query()
            ->with('sport:id,name', 'venue:id,name', 'sportFormat:id,name,players_per_side')
            ->when($request->string('status')->toString(), fn ($q, $status) => $q->where('status', $status))
            ->when($request->integer('sport_id') ?: null, fn ($q, $sportId) => $q->where('sport_id', $sportId))
            ->orderByDesc('starts_at')
            ->get();
    }

    public function show(Tournament $tournament)
    {
        return $tournament->load(
            'sport:id,name', 'venue:id,name', 'organizer:id,name',
            'venueOrganizer:id,name', 'livestreamOrganizer:id,name', 'sportFormat:id,name,players_per_side'
        );
    }

    // A main organizer can assign one venue organizer (scoreboard) and one
    // livestream organizer (camera feed) per tournament — MatchPolicy and
    // LivestreamPolicy scope those roles' access to exactly this tournament.
    public function availableOrganizers()
    {
        return [
            'venue_organizers' => User::role('venue_organizer')->select('id', 'name', 'email')->orderBy('name')->get(),
            'livestream_organizers' => User::role('livestream_organizer')->select('id', 'name', 'email')->orderBy('name')->get(),
        ];
    }

    public function store(Request $request)
    {
        $this->authorize('create', Tournament::class);

        $data = $request->validate([
            'sport_id' => ['required', 'exists:sports,id'],
            'sport_format_id' => ['nullable', 'exists:sport_formats,id'],
            'name' => ['required', 'string', 'max:255'],
            'format' => ['required', 'in:single_elimination,double_elimination,round_robin,group_stage,swiss'],
            'starts_at' => ['required', 'date'],
            'ends_at' => ['nullable', 'date', 'after:starts_at'],
            'venue_id' => ['nullable', 'exists:venues,id'],
            'venue_organizer_id' => ['nullable', 'exists:users,id', $this->hasRoleRule('venue_organizer')],
            'livestream_organizer_id' => ['nullable', 'exists:users,id', $this->hasRoleRule('livestream_organizer')],
            'scoring_type' => ['sometimes', 'in:single_score,best_of_sets'],
            'sets_to_win' => ['required_if:scoring_type,best_of_sets', 'nullable', 'integer', 'min:2', 'max:4'],
        ]);

        $this->validateSportFormat($data);

        $tournament = $request->user()->organizedTournaments()->create([
            ...$data,
            'status' => 'draft',
        ]);

        return response()->json(
            $tournament->load(
                'sport:id,name', 'venue:id,name', 'venueOrganizer:id,name',
                'livestreamOrganizer:id,name', 'sportFormat:id,name,players_per_side'
            ),
            201
        );
    }

    // A team tournament (sport_format_id set) is single_elimination-only for
    // now — every other bracket format's advancement logic would need a
    // team-aware rework this pass doesn't cover yet.
    private function validateSportFormat(array $data): void
    {
        if (! isset($data['sport_format_id'])) {
            return;
        }

        $format = SportFormat::find($data['sport_format_id']);

        if (! $format || $format->sport_id !== (int) $data['sport_id']) {
            throw ValidationException::withMessages([
                'sport_format_id' => ['This format does not belong to the selected sport.'],
            ]);
        }

        if ($format->players_per_side <= 1) {
            throw ValidationException::withMessages([
                'sport_format_id' => ['This format does not require a team.'],
            ]);
        }

        if (($data['format'] ?? null) !== 'single_elimination') {
            throw ValidationException::withMessages([
                'format' => ['Team tournaments only support single elimination for now.'],
            ]);
        }
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
            'venue_organizer_id' => ['nullable', 'exists:users,id', $this->hasRoleRule('venue_organizer')],
            'livestream_organizer_id' => ['nullable', 'exists:users,id', $this->hasRoleRule('livestream_organizer')],
        ]);

        $tournament->update($data);

        return $tournament;
    }

    private function hasRoleRule(string $role): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail) use ($role) {
            if ($value && ! User::find($value)?->hasRole($role)) {
                $fail("The selected {$attribute} is not a {$role}.");
            }
        };
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

    public function bracket(Tournament $tournament, BracketService $bracketService)
    {
        if (! $tournament->bracket) {
            $bracketService->autoStartExpired();
            $tournament->refresh();
        }

        $bracket = $tournament->bracket;

        if (! $bracket) {
            return response()->json(['message' => 'No bracket generated yet.'], 404);
        }

        return $bracket->load(
            'matches.participantA:id,name', 'matches.participantB:id,name', 'matches.winner:id,name',
            'matches.participantATeam:id,name', 'matches.participantBTeam:id,name', 'matches.winnerTeam:id,name'
        );
    }
}
