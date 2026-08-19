<?php

namespace App\Http\Controllers;

use App\Models\GameMatch;
use App\Models\MatchStatSheet;
use App\Models\Team;
use App\Models\TournamentRegistration;
use App\Support\StatSheetFieldSets;
use Illuminate\Http\Request;

class MatchStatSheetController extends Controller
{
    public function show(GameMatch $match)
    {
        $this->authorize('viewStatSheet', $match);

        $fieldSet = $this->fieldSetFor($match);
        [$self, $opponent] = $this->resolveParticipant($match);

        $sheet = MatchStatSheet::firstOrCreate($this->identityKey($match, $self), [
            'sport_id' => $match->bracket->tournament->sport_id,
            'is_locked' => $match->status === 'completed',
            'locked_at' => $match->status === 'completed' ? now() : null,
            'data' => $this->defaultData($fieldSet, $self),
        ]);

        return $this->respond($match, $sheet, $self, $opponent, $fieldSet);
    }

    public function update(Request $request, GameMatch $match)
    {
        $this->authorize('viewStatSheet', $match);

        $fieldSet = $this->fieldSetFor($match);
        [$self, $opponent] = $this->resolveParticipant($match);

        $sheet = MatchStatSheet::where($this->identityKey($match, $self))->firstOrFail();

        if ($match->status === 'completed' || $sheet->is_locked) {
            abort(422, 'This stat sheet is locked and can no longer be edited.');
        }

        $validated = $request->validate($this->validationRules($fieldSet));

        $sheet->update(['data' => $validated['data'], 'filled_by_user_id' => $request->user()->id]);

        return $this->respond($match, $sheet->fresh(), $self, $opponent, $fieldSet);
    }

    // Powers both the T-minus-10 auto-popup trigger and the manual "Stat
    // Sheet" button's visibility on the coach's Tournament tab, across every
    // sport StatSheetFieldSets supports — not just basketball.
    public function myUpcoming(Request $request)
    {
        $userId = $request->user()->id;
        $teamIds = Team::where('captain_id', $userId)->pluck('id');
        $registeredUserIds = TournamentRegistration::where('registered_by', $userId)
            ->whereNotNull('user_id')
            ->pluck('user_id');

        $matches = GameMatch::where(function ($q) use ($teamIds, $registeredUserIds) {
            $q->whereIn('participant_a_team_id', $teamIds)
                ->orWhereIn('participant_b_team_id', $teamIds)
                ->orWhereIn('participant_a_id', $registeredUserIds)
                ->orWhereIn('participant_b_id', $registeredUserIds);
        })
            ->where('status', '!=', 'completed')
            ->whereNotNull('scheduled_at')
            ->whereHas('bracket.tournament.sport', fn ($q) => $q->whereIn('name', StatSheetFieldSets::supportedSportNames()))
            ->with([
                'participantATeam:id,name', 'participantBTeam:id,name',
                'participantA:id,name', 'participantB:id,name',
                'bracket.tournament:id,name,sport_id',
            ])
            ->get();

        return $matches->map(function (GameMatch $match) use ($teamIds, $registeredUserIds) {
            if ($match->participant_a_team_id !== null) {
                $isSelfA = $teamIds->contains($match->participant_a_team_id);
                $selfName = $isSelfA ? $match->participantATeam?->name : $match->participantBTeam?->name;
                $opponentName = $isSelfA ? ($match->participantBTeam?->name ?? 'TBD') : ($match->participantATeam?->name ?? 'TBD');
            } else {
                $isSelfA = $registeredUserIds->contains($match->participant_a_id);
                $selfName = $isSelfA ? $match->participantA?->name : $match->participantB?->name;
                $opponentName = $isSelfA ? ($match->participantB?->name ?? 'TBD') : ($match->participantA?->name ?? 'TBD');
            }

            return [
                'match_id' => $match->id,
                'participant_name' => $selfName,
                'opponent_name' => $opponentName,
                'tournament_name' => $match->bracket->tournament->name,
                'scheduled_at' => $match->scheduled_at,
                'status' => $match->status,
            ];
        })->values();
    }

    private function fieldSetFor(GameMatch $match): array
    {
        $tournament = $match->bracket->tournament;
        $fieldSet = StatSheetFieldSets::for($tournament->sport->name, $tournament->sportFormat?->name);
        abort_if($fieldSet === null, 404, 'This sport does not have a stat sheet yet.');

        return $fieldSet;
    }

    /** @return array{0: array{type: string, id: int, name: string}, 1: array{type: string, id: int, name: string}|null} */
    private function resolveParticipant(GameMatch $match): array
    {
        $userId = request()->user()->id;

        if ($match->participant_a_team_id !== null) {
            $teamA = ['type' => 'team', 'id' => $match->participant_a_team_id, 'name' => $match->participantATeam?->name];
            $teamB = $match->participantBTeam ? ['type' => 'team', 'id' => $match->participant_b_team_id, 'name' => $match->participantBTeam->name] : null;

            return $match->participantATeam?->captain_id === $userId ? [$teamA, $teamB] : [$teamB, $teamA];
        }

        $registeredIds = TournamentRegistration::where('tournament_id', $match->bracket->tournament_id)
            ->where('registered_by', $userId)
            ->pluck('user_id');

        $userA = ['type' => 'user', 'id' => $match->participant_a_id, 'name' => $match->participantA?->name];
        $userB = $match->participantB ? ['type' => 'user', 'id' => $match->participant_b_id, 'name' => $match->participantB->name] : null;

        return $registeredIds->contains($match->participant_a_id) ? [$userA, $userB] : [$userB, $userA];
    }

    private function identityKey(GameMatch $match, array $self): array
    {
        return [
            'match_id' => $match->id,
            'team_id' => $self['type'] === 'team' ? $self['id'] : null,
            'user_id' => $self['type'] === 'user' ? $self['id'] : null,
        ];
    }

    private function defaultData(array $fieldSet, array $self): array
    {
        $zeroed = array_fill_keys(array_column($fieldSet['fields'], 'key'), 0);

        if ($fieldSet['mode'] === 'roster') {
            $rows = [];

            if ($self['type'] === 'team') {
                $team = Team::with(['members' => fn ($q) => $q->where('status', 'accepted')->with('user:id,name')])
                    ->find($self['id']);

                $rows = $team->members->map(fn ($m) => [
                    'player_id' => $m->user->id,
                    'name' => $m->user->name,
                    'jersey_number' => '',
                    'notes' => '',
                    'stats' => $zeroed,
                ])->values()->all();
            }

            return ['rows' => $rows, 'further_comments' => null, 'recorded_by' => null, 'signed' => null];
        }

        return [
            'values' => $zeroed,
            'total_percent' => array_fill_keys(array_column($fieldSet['fields'], 'key'), null),
            'further_comments' => null,
            'recorded_by' => null,
            'signed' => null,
        ];
    }

    private function validationRules(array $fieldSet): array
    {
        $fieldKeys = array_column($fieldSet['fields'], 'key');
        $numericRule = ['nullable', 'numeric', 'min:0'];

        if ($fieldSet['mode'] === 'roster') {
            return array_merge(
                [
                    'data' => ['required', 'array'],
                    'data.rows' => ['required', 'array'],
                    'data.rows.*.player_id' => ['nullable', 'integer'],
                    'data.rows.*.name' => ['nullable', 'string'],
                    'data.rows.*.jersey_number' => ['nullable', 'string'],
                    'data.rows.*.notes' => ['nullable', 'string'],
                    'data.further_comments' => ['nullable', 'string'],
                    'data.recorded_by' => ['nullable', 'string'],
                    'data.signed' => ['nullable', 'string'],
                ],
                array_fill_keys(array_map(fn ($k) => "data.rows.*.stats.{$k}", $fieldKeys), $numericRule)
            );
        }

        return array_merge(
            [
                'data' => ['required', 'array'],
                'data.further_comments' => ['nullable', 'string'],
                'data.recorded_by' => ['nullable', 'string'],
                'data.signed' => ['nullable', 'string'],
            ],
            array_fill_keys(array_map(fn ($k) => "data.values.{$k}", $fieldKeys), $numericRule),
            array_fill_keys(array_map(fn ($k) => "data.total_percent.{$k}", $fieldKeys), $numericRule)
        );
    }

    private function respond(GameMatch $match, MatchStatSheet $sheet, array $self, ?array $opponent, array $fieldSet): array
    {
        $tournament = $match->bracket->tournament;

        return [
            'id' => $sheet->id,
            'match_id' => $match->id,
            'sport_name' => $tournament->sport->name,
            'mode' => $fieldSet['mode'],
            'fields' => $fieldSet['fields'],
            'participant_type' => $self['type'],
            'participant_name' => $self['name'],
            'opponent_name' => $opponent['name'] ?? 'TBD',
            'tournament_name' => $tournament->name,
            'scheduled_at' => $match->scheduled_at,
            'match_status' => $match->status,
            'is_locked' => $sheet->is_locked || $match->status === 'completed',
            'locked_at' => $sheet->locked_at,
            'filled_by' => $sheet->filledBy ? ['id' => $sheet->filledBy->id, 'name' => $sheet->filledBy->name] : null,
            'data' => $sheet->data,
        ];
    }
}
