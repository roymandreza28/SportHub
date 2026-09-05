<?php

namespace App\Http\Controllers;

use App\Events\MatchClockChanged;
use App\Events\MatchEventCreated;
use App\Events\MatchStatusChanged;
use App\Models\GameMatch;
use App\Models\MatchEvent;
use App\Models\MatchPlayerStat;
use App\Models\MatchStatSheet;
use App\Models\Team;
use App\Models\TeamMember;
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
            'player_stats' => ['sometimes', 'array'],
            'player_stats.*.user_id' => ['required_with:player_stats', 'integer'],
            'player_stats.*.stats' => ['required_with:player_stats', 'array'],
        ]);

        $match->update(collect($data)->except('player_stats')->all());
        $this->upsertPlayerStats($match, $data['player_stats'] ?? []);

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
                $this->completeMatch($match, $bracketService, null, $winnerTeamId);
            } else {
                $winnerId = match (true) {
                    $match->score_a > $match->score_b => $match->participant_a_id,
                    $match->score_b > $match->score_a => $match->participant_b_id,
                    default => null,
                };
                $this->completeMatch($match, $bracketService, $winnerId, null);
            }
        }

        Broadcasting::safely(fn () => MatchStatusChanged::dispatch($match->fresh()));

        return $this->respond($match->fresh(self::PARTICIPANT_RELATIONS));
    }

    // A venue organizer's alternative to ever opening the scoreboard at all —
    // one side didn't show up / withdrew, so the game is decided without a
    // single point played. won_by_default keeps this distinguishable from a
    // real (possibly 0-0, e.g. an abandoned racket-sport game) scored result
    // everywhere the match is displayed, including a shared news post.
    public function forfeit(Request $request, GameMatch $match, BracketService $bracketService)
    {
        $this->authorize('updateScore', $match);

        abort_if($match->status === 'completed', 422, 'This match is already completed.');

        $data = $request->validate([
            'winner_side' => ['required', 'in:a,b'],
        ]);

        $isTeamMatch = $match->participant_a_team_id !== null;
        $winnerId = ! $isTeamMatch
            ? ($data['winner_side'] === 'a' ? $match->participant_a_id : $match->participant_b_id)
            : null;
        $winnerTeamId = $isTeamMatch
            ? ($data['winner_side'] === 'a' ? $match->participant_a_team_id : $match->participant_b_team_id)
            : null;

        abort_if($winnerId === null && $winnerTeamId === null, 422, 'Both sides of this match must be determined before declaring a winner by default.');

        $match->update(['won_by_default' => true]);
        $this->completeMatch($match, $bracketService, $winnerId, $winnerTeamId);

        $matchEvent = MatchEvent::create([
            'match_id' => $match->id,
            'type' => 'point',
            'payload' => ['won_by_default' => true, 'winner_side' => $data['winner_side']],
        ]);

        Broadcasting::safely(fn () => MatchEventCreated::dispatch($matchEvent));
        Broadcasting::safely(fn () => MatchStatusChanged::dispatch($match->fresh()));

        return $this->respond($match->fresh(self::PARTICIPANT_RELATIONS));
    }

    // Shared tail end of every "this match is now decided" path (a normal
    // score completing, a best-of-sets match reaching sets_to_win, or a
    // forfeit) — always advances the bracket (even on a tie/no-winner,
    // since group_stage needs this to know a group's matches are all done)
    // and locks any stat sheets against further edits.
    private function completeMatch(GameMatch $match, BracketService $bracketService, ?int $winnerId, ?int $winnerTeamId): void
    {
        $match->update([
            'status' => 'completed',
            'winner_id' => $winnerId,
            'winner_team_id' => $winnerTeamId,
        ]);

        $bracketService->advanceWinner($match->fresh());
        $this->lockStatSheets($match);
    }

    // Display-cache half of the stat sheet's dual lock design — a coach's
    // MatchStatSheetController::show()/update() always independently
    // re-derive lock state from $match->status too, so this hook existing
    // or not can never let an edit slip through.
    private function lockStatSheets(GameMatch $match): void
    {
        MatchStatSheet::where('match_id', $match->id)->update(['is_locked' => true, 'locked_at' => now()]);
    }

    // Folded into the score-save round-trip every scoreboard already fires
    // on each tap, rather than a second network call per click. team_id is
    // always derived here from real TeamMember rows — the validation rules
    // above deliberately don't accept a client-sent team_id at all, so a
    // scoreboard can never misattribute a player to the wrong team.
    private function upsertPlayerStats(GameMatch $match, array $rows): void
    {
        if ($rows === []) {
            return;
        }

        $sportId = $match->bracket->tournament->sport_id;

        foreach ($rows as $row) {
            $teamId = match (true) {
                $match->participant_a_team_id !== null && TeamMember::where('team_id', $match->participant_a_team_id)->where('user_id', $row['user_id'])->where('status', 'accepted')->exists() => $match->participant_a_team_id,
                $match->participant_b_team_id !== null && TeamMember::where('team_id', $match->participant_b_team_id)->where('user_id', $row['user_id'])->where('status', 'accepted')->exists() => $match->participant_b_team_id,
                default => null,
            };

            MatchPlayerStat::updateOrCreate(
                ['match_id' => $match->id, 'user_id' => $row['user_id']],
                ['team_id' => $teamId, 'sport_id' => $sportId, 'stats' => $row['stats']]
            );
        }
    }

    // Basketball/3x3's game clock lives entirely in the venue organizer's own
    // browser (see BasketballScoreboard.tsx) — this is the only thing that
    // ever leaves that tab, and only on a real transition (start, pause,
    // period/overtime change, manual adjustment), never once per tick. A
    // viewer's shared-post widget extrapolates the running countdown locally
    // between syncs from clock_seconds_remaining + clock_synced_at. Every
    // other sport's scoreboard never calls this at all, so these columns
    // just stay null for them.
    public function updateClock(Request $request, GameMatch $match)
    {
        $this->authorize('updateScore', $match);

        $data = $request->validate([
            'clock_seconds_remaining' => ['nullable', 'integer', 'min:0'],
            'clock_shot_seconds_remaining' => ['nullable', 'integer', 'min:0'],
            'clock_running' => ['required', 'boolean'],
            'clock_period_label' => ['nullable', 'string', 'max:40'],
        ]);

        $match->update([
            'clock_seconds_remaining' => $data['clock_seconds_remaining'] ?? null,
            'clock_shot_seconds_remaining' => $data['clock_shot_seconds_remaining'] ?? null,
            'clock_running' => $data['clock_running'],
            'clock_period_label' => $data['clock_period_label'] ?? null,
            'clock_synced_at' => now(),
        ]);

        Broadcasting::safely(fn () => MatchClockChanged::dispatch($match->fresh()));

        return $match->fresh();
    }

    // Setting date/time/court is the main organizer's job (see
    // MatchPolicy::schedule()) — distinct from updateScore(), which belongs
    // to the venue organizer. A completed game's result is locked in, so its
    // schedule can't be changed anymore either.
    public function schedule(Request $request, GameMatch $match)
    {
        $this->authorize('schedule', $match);

        if ($match->status === 'completed') {
            abort(422, 'Completed games can\'t be rescheduled.');
        }

        $data = $request->validate([
            'scheduled_at' => ['nullable', 'date'],
            'court_id' => ['nullable', 'exists:courts,id'],
        ]);

        $match->update($data);

        Broadcasting::safely(fn () => MatchStatusChanged::dispatch($match->fresh()));

        return $match->fresh(['court.venue', ...self::PARTICIPANT_RELATIONS]);
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
            'player_stats' => ['sometimes', 'array'],
            'player_stats.*.user_id' => ['required_with:player_stats', 'integer'],
            'player_stats.*.stats' => ['required_with:player_stats', 'array'],
        ]);

        $this->upsertPlayerStats($match, $data['player_stats'] ?? []);

        $setsWonA = collect($data['sets'])->filter(fn ($s) => $s['score_a'] > $s['score_b'])->count();
        $setsWonB = collect($data['sets'])->filter(fn ($s) => $s['score_b'] > $s['score_a'])->count();
        $isDecided = $setsWonA >= $tournament->sets_to_win || $setsWonB >= $tournament->sets_to_win;
        $isTeamMatch = $match->participant_a_team_id !== null;

        $match->update([
            'sets' => $data['sets'],
            'score_a' => $setsWonA,
            'score_b' => $setsWonB,
            'status' => $isDecided ? 'completed' : 'live',
        ]);

        $matchEvent = MatchEvent::create([
            'match_id' => $match->id,
            'type' => 'point',
            'payload' => ['score_a' => $setsWonA, 'score_b' => $setsWonB, 'sets' => $data['sets']],
        ]);

        Broadcasting::safely(fn () => MatchEventCreated::dispatch($matchEvent));

        if ($isDecided) {
            $winnerId = (! $isTeamMatch) ? ($setsWonA > $setsWonB ? $match->participant_a_id : $match->participant_b_id) : null;
            $winnerTeamId = $isTeamMatch ? ($setsWonA > $setsWonB ? $match->participant_a_team_id : $match->participant_b_team_id) : null;
            $this->completeMatch($match, $bracketService, $winnerId, $winnerTeamId);
        }

        Broadcasting::safely(fn () => MatchStatusChanged::dispatch($match->fresh()));

        return $this->respond($match->fresh(self::PARTICIPANT_RELATIONS));
    }
}
