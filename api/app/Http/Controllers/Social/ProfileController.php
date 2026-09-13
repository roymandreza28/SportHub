<?php

namespace App\Http\Controllers\Social;

use App\Http\Controllers\Controller;
use App\Models\MatchPlayerStat;
use App\Models\User;
use App\Support\PlayerStatFieldSets;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class ProfileController extends Controller
{
    public function updateCover(Request $request)
    {
        $data = $request->validate([
            'cover' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
        ]);

        $user = $request->user();

        if ($user->cover_path) {
            Storage::disk('public')->delete($user->cover_path);
        }

        $user->update(['cover_path' => $request->file('cover')->store('covers/'.$user->id, 'public')]);

        return ['cover_url' => $user->fresh()->cover_url];
    }

    public function show(Request $request, User $user)
    {
        abort_unless($user->hasAnyRole(['player', 'coach']), 404);

        $viewer = $request->user();
        $status = 'none';
        $friendshipId = null;

        if ($viewer->id === $user->id) {
            $status = 'self';
        } else {
            $friendship = $viewer->friendshipWith($user);

            if ($friendship) {
                $friendshipId = $friendship->id;

                if ($friendship->status === 'accepted') {
                    $status = 'friends';
                } elseif ($friendship->status === 'pending') {
                    $status = $friendship->requester_id === $viewer->id ? 'pending_sent' : 'pending_received';
                }
                // A 'declined' friendship falls through to 'none', letting the
                // requester send a fresh request rather than being stuck forever.
            }
        }

        return [
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'roles' => $user->getRoleNames()->values(),
                'bio' => $user->playerProfile?->bio,
                'primary_sport' => $user->playerProfile?->primarySport?->name,
                'avatar_url' => $user->avatar_url,
                'cover_url' => $user->cover_url,
                'friends_count' => $user->friends()->count(),
                // A coach's evaluation (EvaluationController::store()) updates
                // this same skill_levels row per sport, so surfacing it here
                // is how the profile actually shows a coach's evaluation —
                // GET /api/evaluations is a coach-only endpoint (requires the
                // 'evaluate player' permission), so it can't be reused for a
                // profile any player/coach might be viewing.
                // latestEvaluation is what the profile's skill radar chart
                // renders (its criteria.attributes, when the coach filled
                // those in rather than just level/score) — see SkillLevel::
                // latestEvaluation()'s own doc comment.
                'skill_levels' => $user->playerProfile?->skillLevels()->with('sport', 'coach:id,name', 'latestEvaluation')->get() ?? [],
            ],
            'friendship_status' => $status,
            'friendship_id' => $friendshipId,
        ];
    }

    // Career totals for the venue-organizer scoreboard's per-player stats
    // (see MatchController::upsertPlayerStats()), grouped by sport, powering
    // ProfilePage.tsx's stats pentagon — plus each match's win/loss result
    // (from the same bracket data BracketService already maintains) rolled
    // up into a per-sport and overall win rate, and the full match-by-match
    // history list. Only completed matches count, so a career total never
    // fluctuates mid-game.
    public function statSummary(User $user)
    {
        abort_unless($user->hasAnyRole(['player', 'coach']), 404);

        $rows = MatchPlayerStat::where('user_id', $user->id)
            ->whereHas('match', fn ($q) => $q->where('status', 'completed'))
            ->with([
                'sport:id,name',
                'match.bracket.tournament:id,name',
                'match.participantA:id,name',
                'match.participantB:id,name',
                'match.participantATeam:id,name',
                'match.participantBTeam:id,name',
            ])
            ->get();

        $history = $rows
            ->map(fn ($row) => $this->historyEntryFor($row, $user))
            ->sortByDesc('date')
            ->values();

        $bySport = $rows->groupBy('sport_id')->map(function ($sportRows) use ($user) {
            $sportName = $sportRows->first()->sport->name;
            $fields = PlayerStatFieldSets::for($sportName) ?? [];
            $totals = array_fill_keys(array_column($fields, 'key'), 0);
            $wins = 0;
            $losses = 0;

            foreach ($sportRows as $row) {
                foreach ($row->stats ?? [] as $key => $value) {
                    if (array_key_exists($key, $totals)) {
                        $totals[$key] += (int) $value;
                    }
                }

                match ($this->resultFor($row, $user)) {
                    'win' => $wins++,
                    'loss' => $losses++,
                    default => null,
                };
            }

            $decided = $wins + $losses;

            return [
                'sport_id' => $sportRows->first()->sport_id,
                'sport_name' => $sportName,
                'matches_played' => $sportRows->count(),
                'wins' => $wins,
                'losses' => $losses,
                'win_rate' => $decided > 0 ? round($wins / $decided * 100, 1) : 0,
                'totals' => $totals,
                'pentagon_fields' => PlayerStatFieldSets::pentagonAxesFor($sportName),
            ];
        })->values();

        $totalWins = $bySport->sum('wins');
        $totalLosses = $bySport->sum('losses');
        $totalDecided = $totalWins + $totalLosses;

        return [
            'sports' => $bySport,
            'overall' => [
                'matches_played' => $rows->count(),
                'wins' => $totalWins,
                'losses' => $totalLosses,
                'win_rate' => $totalDecided > 0 ? round($totalWins / $totalDecided * 100, 1) : 0,
                'by_sport' => $bySport->map(fn ($s) => [
                    'sport_id' => $s['sport_id'],
                    'sport_name' => $s['sport_name'],
                    'win_rate' => $s['win_rate'],
                ])->values(),
            ],
            'history' => $history,
        ];
    }

    // 'draw' covers both a genuine tie and a match BracketService advanced
    // without recording either winner column (e.g. a group-stage decider) —
    // in both cases there's no winning side to credit, so it's never counted
    // as a win or a loss in the win-rate rollup above.
    private function resultFor(MatchPlayerStat $row, User $user): string
    {
        $match = $row->match;
        $isTeamMatch = $row->team_id !== null;
        $winningSide = $isTeamMatch ? $match->winner_team_id : $match->winner_id;

        if ($winningSide === null) {
            return 'draw';
        }

        $won = $isTeamMatch ? $winningSide === $row->team_id : $winningSide === $user->id;

        return $won ? 'win' : 'loss';
    }

    private function historyEntryFor(MatchPlayerStat $row, User $user): array
    {
        $match = $row->match;
        $isTeamMatch = $row->team_id !== null;

        $opponentName = $isTeamMatch
            ? ($match->participant_a_team_id === $row->team_id ? $match->participantBTeam?->name : $match->participantATeam?->name)
            : ($match->participant_a_id === $user->id ? $match->participantB?->name : $match->participantA?->name);

        return [
            'match_id' => $match->id,
            'sport_name' => $row->sport->name,
            'tournament_name' => $match->bracket?->tournament?->name,
            'opponent_name' => $opponentName ?? 'TBD',
            'result' => $this->resultFor($row, $user),
            'score' => $match->score_a !== null && $match->score_b !== null ? "{$match->score_a}-{$match->score_b}" : null,
            'date' => ($match->scheduled_at ?? $match->updated_at)?->toIso8601String(),
        ];
    }
}
