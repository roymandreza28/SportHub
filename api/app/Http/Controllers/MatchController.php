<?php

namespace App\Http\Controllers;

use App\Events\MatchEventCreated;
use App\Events\MatchStatusChanged;
use App\Models\GameMatch;
use App\Models\MatchEvent;
use App\Models\Team;
use App\Models\Tournament;
use App\Services\BracketService;
use App\Support\Broadcasting;
use App\Support\MatchParticipants;
use Illuminate\Http\Request;

class MatchController extends Controller
{
    private const PARTICIPANT_RELATIONS = [
        'participantA:id,name', 'participantB:id,name', 'winner:id,name',
        'participantATeam:id,name', 'participantBTeam:id,name', 'winnerTeam:id,name',
    ];

    public function updateScore(Request $request, GameMatch $match, BracketService $bracketService)
    {
        $this->authorize('updateScore', $match);

        $tournament = $match->bracket->tournament;

        if ($tournament->scoring_type === 'best_of_sets') {
            return $this->updateSetsScore($request, $match, $tournament, $bracketService);
        }

        $data = $request->validate([
            'score_a' => ['required', 'integer', 'min:0'],
            'score_b' => ['required', 'integer', 'min:0'],
            'status' => ['sometimes', 'in:scheduled,live,completed'],
        ]);

        $match->update($data);

        $matchEvent = MatchEvent::create([
            'match_id' => $match->id,
            'type' => 'point',
            'payload' => ['score_a' => $match->score_a, 'score_b' => $match->score_b],
        ]);

        Broadcasting::safely(fn () => MatchEventCreated::dispatch($matchEvent));

        if (($data['status'] ?? null) === 'completed') {
            $isTeamMatch = $match->participant_a_team_id !== null;

            if ($isTeamMatch) {
                $winnerTeamId = match (true) {
                    $match->score_a > $match->score_b => $match->participant_a_team_id,
                    $match->score_b > $match->score_a => $match->participant_b_team_id,
                    default => null,
                };
                $match->update(['winner_team_id' => $winnerTeamId]);
            } else {
                $winnerId = match (true) {
                    $match->score_a > $match->score_b => $match->participant_a_id,
                    $match->score_b > $match->score_a => $match->participant_b_id,
                    default => null,
                };
                $match->update(['winner_id' => $winnerId]);
            }

            // Always run, even on a tie (no winner): group_stage needs this
            // to know a group's matches are all done and start the knockout
            // stage regardless of whether every result had a clear winner.
            $bracketService->advanceWinner($match->fresh());
        }

        Broadcasting::safely(fn () => MatchStatusChanged::dispatch($match->fresh()));

        return $this->respond($match->fresh(self::PARTICIPANT_RELATIONS));
    }

    // Powers the scoreboard's player-attribution UI (jersey numbers, "who
    // scored"/"who fouled" pickers) — only meaningful for team matches, so
    // an individual-tournament match just returns both sides null.
    public function roster(GameMatch $match)
    {
        $this->authorize('updateScore', $match);

        $match->load([
            'participantATeam.members' => fn ($q) => $q->where('status', 'accepted')->with('user:id,name'),
            'participantBTeam.members' => fn ($q) => $q->where('status', 'accepted')->with('user:id,name'),
        ]);

        $shape = fn (?Team $team) => $team ? [
            'id' => $team->id,
            'name' => $team->name,
            'members' => $team->members->map(fn ($m) => ['id' => $m->user->id, 'name' => $m->user->name])->values(),
        ] : null;

        return [
            'team_a' => $shape($match->participantATeam),
            'team_b' => $shape($match->participantBTeam),
        ];
    }

    private function respond(GameMatch $match)
    {
        return array_merge($match->toArray(), [
            'participant_a' => MatchParticipants::shape($match->participant_a_team_id, $match->participantATeam, $match->participantA),
            'participant_b' => MatchParticipants::shape($match->participant_b_team_id, $match->participantBTeam, $match->participantB),
            'winner' => MatchParticipants::shape($match->winner_team_id, $match->winnerTeam, $match->winner),
        ]);
    }

    // Table tennis's "Best of 5/7 Sets" and volleyball's "Best of Series" —
    // score_a/score_b on the match hold SETS WON (not points), derived here
    // from the full submitted set list, so every existing consumer (the
    // bracket card, the champion banner) keeps working unchanged for both
    // scoring types. The match completes itself once either side reaches
    // the tournament's sets_to_win, rather than the organizer marking it
    // completed by hand.
    private function updateSetsScore(Request $request, GameMatch $match, Tournament $tournament, BracketService $bracketService)
    {
        $data = $request->validate([
            'sets' => ['required', 'array', 'min:1'],
            'sets.*.score_a' => ['required', 'integer', 'min:0'],
            'sets.*.score_b' => ['required', 'integer', 'min:0'],
        ]);

        $setsWonA = collect($data['sets'])->filter(fn ($s) => $s['score_a'] > $s['score_b'])->count();
        $setsWonB = collect($data['sets'])->filter(fn ($s) => $s['score_b'] > $s['score_a'])->count();
        $isDecided = $setsWonA >= $tournament->sets_to_win || $setsWonB >= $tournament->sets_to_win;
        $isTeamMatch = $match->participant_a_team_id !== null;

        $match->update([
            'sets' => $data['sets'],
            'score_a' => $setsWonA,
            'score_b' => $setsWonB,
            'status' => $isDecided ? 'completed' : 'live',
            'winner_id' => (! $isTeamMatch && $isDecided)
                ? ($setsWonA > $setsWonB ? $match->participant_a_id : $match->participant_b_id) : null,
            'winner_team_id' => ($isTeamMatch && $isDecided)
                ? ($setsWonA > $setsWonB ? $match->participant_a_team_id : $match->participant_b_team_id) : null,
        ]);

        $matchEvent = MatchEvent::create([
            'match_id' => $match->id,
            'type' => 'point',
            'payload' => ['score_a' => $setsWonA, 'score_b' => $setsWonB, 'sets' => $data['sets']],
        ]);

        Broadcasting::safely(fn () => MatchEventCreated::dispatch($matchEvent));

        if ($isDecided) {
            $bracketService->advanceWinner($match->fresh());
        }

        Broadcasting::safely(fn () => MatchStatusChanged::dispatch($match->fresh()));

        return $this->respond($match->fresh(self::PARTICIPANT_RELATIONS));
    }
}
