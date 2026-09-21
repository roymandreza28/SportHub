<?php

namespace Database\Seeders;

use App\Models\GameMatch;
use App\Models\MatchEvent;
use App\Models\MatchPlayerStat;
use App\Models\MatchStatSheet;
use App\Models\Team;
use App\Models\Tournament;
use App\Models\User;
use App\Support\PlayerStatSheetLinkage;
use App\Support\StatSheetFieldSets;
use Illuminate\Database\Seeder;
use Illuminate\Support\Collection;

// Every completed match already carries MatchPlayerStat (the venue
// organizer's live scoreboard numbers — see recordPlayerStats() and
// recordIndividualPlayerStats() in ExtendedTournamentsSeeder), but most of
// the earlier seeder-family tournaments never got the two things the
// FullDetailBasketballTournamentSeeder-style seeders add: a locked coach
// MatchStatSheet per participant, and a MatchEvent point/set log building up
// to the final score. This seeder fills in exactly those two things for
// every completed match that's missing them, across EVERY sport
// StatSheetFieldSets supports — generic, not hardcoded to one tournament —
// so a fresh full-detail seeder added later, or a tournament played out by
// hand, gets backfilled the same way.
//
// Deliberately idempotent and non-destructive: it never touches a match's
// existing score/winner/status, and it skips any match that already has at
// least one stat sheet AND one event (so re-running this after
// FullDetailBasketballTournamentSeeder et al. is a safe no-op for those).
// For any stat-sheet field PlayerStatSheetLinkage marks as locked (i.e. the
// real app always overlays it live from MatchPlayerStat — see
// MatchStatSheetController::overlayOrganizerStats()), the seeded value here
// is pulled from the match's own existing MatchPlayerStat rows rather than
// invented at random, so the two views the app forces to agree are already
// in agreement even before that overlay logic ever runs.
class DetailedMatchHistoryBackfillSeeder extends Seeder
{
    public function run(): void
    {
        $matches = GameMatch::where('status', 'completed')
            ->with(['bracket.tournament.sport', 'bracket.tournament.sportFormat'])
            ->get()
            ->filter(fn (GameMatch $m) => $m->bracket?->tournament !== null);

        $filled = 0;
        $skippedNoFieldSet = 0;

        foreach ($matches as $match) {
            if ($this->alreadyDetailed($match)) {
                continue;
            }

            $tournament = $match->bracket->tournament;
            $formatName = $this->effectiveFormatName($match, $tournament);
            $fieldSet = StatSheetFieldSets::for($tournament->sport->name, $formatName);
            if ($fieldSet === null) {
                $skippedNoFieldSet++;

                continue;
            }

            $this->buildStatSheets($match, $tournament, $fieldSet, $formatName);
            $this->buildMatchEvents($match, $tournament);
            $filled++;
        }

        $this->command?->info("Backfilled stat sheets + match event logs for {$filled} completed match(es)".
            ($skippedNoFieldSet > 0 ? " ({$skippedNoFieldSet} skipped — sport has no stat sheet support)." : '.'));
    }

    private function alreadyDetailed(GameMatch $match): bool
    {
        return MatchStatSheet::where('match_id', $match->id)->exists()
            && MatchEvent::where('match_id', $match->id)->exists();
    }

    // Racquet-sport tournaments that are genuinely individual (Tennis
    // Singles Championship, every *BadmintonTournamentSeeder) deliberately
    // leave sport_format_id NULL — that's what marks them as individual
    // throughout the app (BracketService::generate()'s isTeamTournament
    // flag, TournamentRegistrationController's own check) — so
    // $tournament->sportFormat is never a safe way to ask "is this
    // singles or doubles". A match's own shape already answers that
    // unambiguously: no team on either side can only mean singles here,
    // and StatSheetFieldSets/PlayerStatSheetLinkage are keyed by exactly
    // that Singles/Doubles distinction. Basketball/Volleyball ignore the
    // format argument entirely (see StatSheetFieldSets::for()), so this
    // is harmless for those two regardless of what it resolves to.
    private function effectiveFormatName(GameMatch $match, Tournament $tournament): ?string
    {
        if ($tournament->sportFormat !== null) {
            return $tournament->sportFormat->name;
        }

        return $match->participant_a_team_id === null ? 'Singles' : 'Doubles';
    }

    // ---- stat sheets -------------------------------------------------

    private function buildStatSheets(GameMatch $match, Tournament $tournament, array $fieldSet, ?string $formatName): void
    {
        $sportId = $tournament->sport_id;
        $linkage = PlayerStatSheetLinkage::for($tournament->sport->name, $formatName);
        $isTeamMatch = $match->participant_a_team_id !== null;

        if ($isTeamMatch) {
            foreach ([$match->participant_a_team_id, $match->participant_b_team_id] as $teamId) {
                if (! $teamId) {
                    continue;
                }

                $team = Team::with(['members' => fn ($q) => $q->where('status', 'accepted')])->find($teamId);
                if (! $team || $team->members->isEmpty()) {
                    continue;
                }

                $organizerStats = MatchPlayerStat::where('match_id', $match->id)->where('team_id', $teamId)->get()->keyBy('user_id');

                if ($fieldSet['mode'] === 'roster') {
                    $this->makeRosterSheet($match, $team, $sportId, $tournament->sport->name, $fieldSet, $linkage, $organizerStats);
                } else {
                    $this->makeSummarySheet($match, 'team', $teamId, $team->name, $team->captain_id, $sportId, $fieldSet, $linkage, $organizerStats->values());
                }
            }

            return;
        }

        foreach ([$match->participant_a_id, $match->participant_b_id] as $userId) {
            if (! $userId) {
                continue;
            }

            $organizerStats = MatchPlayerStat::where('match_id', $match->id)->where('user_id', $userId)->get();
            $name = User::find($userId)?->name ?? '';
            $this->makeSummarySheet($match, 'user', $userId, $name, $userId, $sportId, $fieldSet, $linkage, $organizerStats);
        }
    }

    private function makeRosterSheet(GameMatch $match, Team $team, int $sportId, string $sportName, array $fieldSet, array $linkage, Collection $organizerStatsByUser): void
    {
        $lockedSheetKeys = array_values($linkage);
        $sheetToOrganizerKey = array_flip($linkage);
        $names = User::whereIn('id', $team->members->pluck('user_id'))->pluck('name', 'id');

        $rows = $team->members->map(function ($member) use ($fieldSet, $lockedSheetKeys, $sheetToOrganizerKey, $organizerStatsByUser, $names, $sportName) {
            $orgStats = $organizerStatsByUser[$member->user_id]->stats ?? [];
            $stats = [];

            // Locked fields first — whatever the venue organizer's
            // scoreboard already recorded for this player, verbatim.
            foreach ($lockedSheetKeys as $key) {
                $stats[$key] = (int) ($orgStats[$sheetToOrganizerKey[$key]] ?? 0);
            }

            foreach ($fieldSet['fields'] as $field) {
                $key = $field['key'];
                if (array_key_exists($key, $stats)) {
                    continue;
                }
                $stats[$key] = $this->rosterModeExtraStat($sportName, $key, $stats);
            }

            // Re-order to match the field-set's declared column order.
            $ordered = [];
            foreach ($fieldSet['fields'] as $field) {
                $ordered[$field['key']] = $stats[$field['key']] ?? 0;
            }

            return [
                'player_id' => $member->user_id,
                'name' => $names[$member->user_id] ?? '',
                'jersey_number' => (string) rand(0, 99),
                'notes' => '',
                'stats' => $ordered,
            ];
        })->values()->all();

        $coachName = User::find($team->captain_id)?->name;

        MatchStatSheet::updateOrCreate(
            ['match_id' => $match->id, 'team_id' => $team->id, 'user_id' => null],
            [
                'sport_id' => $sportId,
                'filled_by_user_id' => $team->captain_id,
                'is_locked' => true,
                'locked_at' => now(),
                'data' => [
                    'rows' => $rows,
                    'further_comments' => 'Solid team effort — full box score logged post-game.',
                    'recorded_by' => $coachName,
                    'signed' => $coachName,
                ],
            ]
        );
    }

    // Attempt counts for a made-shot pair (Basketball) are generated off
    // the already-locked "made" value so they're never internally
    // impossible (fewer attempts than makes); every other roster-mode
    // field has no organizer-side counterpart at all, so it's a plausible
    // independent value in the same range FullDetailBasketballTournament
    // Seeder/DoubleEliminationBasketballTournamentSeeder already use.
    private function rosterModeExtraStat(string $sportName, string $key, array $statsSoFar): int
    {
        if ($sportName === 'Basketball') {
            return match ($key) {
                'fg2_att' => ($statsSoFar['fg2_made'] ?? 0) + rand(0, 5),
                'fg3_att' => ($statsSoFar['fg3_made'] ?? 0) + rand(0, 4),
                'ft_att' => ($statsSoFar['ft_made'] ?? 0) + rand(0, 3),
                'reb_off' => rand(0, 4),
                'reb_def' => rand(1, 8),
                'assists' => rand(0, 7),
                'steals' => rand(0, 4),
                'blocks' => rand(0, 3),
                'turnovers' => rand(0, 5),
                default => rand(0, 5),
            };
        }

        if ($sportName === 'Volleyball') {
            return match ($key) {
                'total_attacks' => ($statsSoFar['kills'] ?? 0) + ($statsSoFar['errors'] ?? 0) + rand(2, 10),
                'service_errors' => rand(0, 5),
                'block_solos' => rand(0, 4),
                'block_assists' => rand(0, 4),
                'receptions' => rand(4, 16),
                'reception_3' => rand(0, 6),
                'reception_2' => rand(0, 5),
                'reception_1' => rand(0, 4),
                'reception_0' => rand(0, 2),
                default => rand(0, 5),
            };
        }

        return rand(0, 5);
    }

    /** @param  Collection<int, MatchPlayerStat>  $organizerStatRows */
    private function makeSummarySheet(GameMatch $match, string $type, int $id, string $name, int $captainOrSelfId, int $sportId, array $fieldSet, array $linkage, Collection $organizerStatRows): void
    {
        $lockedSheetKeys = array_values($linkage);
        $sheetToOrganizerKey = array_flip($linkage);

        $organizerSum = [];
        foreach ($organizerStatRows as $row) {
            foreach ($row->stats as $k => $v) {
                $organizerSum[$k] = ($organizerSum[$k] ?? 0) + $v;
            }
        }

        $values = [];
        $totalPercent = [];
        foreach ($fieldSet['fields'] as $field) {
            $key = $field['key'];
            $values[$key] = in_array($key, $lockedSheetKeys, true)
                ? (int) ($organizerSum[$sheetToOrganizerKey[$key]] ?? 0)
                : $this->summaryModeExtraStat($key);

            $totalPercent[$key] = str_contains($key, 'rate') || str_contains($key, 'accuracy') || str_contains($key, 'pct')
                ? round(rand(400, 950) / 10, 1)
                : round(rand(150, 600) / 10, 1);
        }

        MatchStatSheet::updateOrCreate(
            ['match_id' => $match->id, 'team_id' => $type === 'team' ? $id : null, 'user_id' => $type === 'user' ? $id : null],
            [
                'sport_id' => $sportId,
                'filled_by_user_id' => $captainOrSelfId,
                'is_locked' => true,
                'locked_at' => now(),
                'data' => [
                    'values' => $values,
                    'total_percent' => $totalPercent,
                    'further_comments' => 'Match played to a full, well-contested finish.',
                    'recorded_by' => $name,
                    'signed' => $name,
                ],
            ]
        );
    }

    private function summaryModeExtraStat(string $key): int
    {
        if (str_contains($key, 'rate') || str_contains($key, 'accuracy') || str_contains($key, 'pct')) {
            return rand(40, 90);
        }

        return rand(1, 22);
    }

    // ---- match event log ----------------------------------------------

    private function buildMatchEvents(GameMatch $match, Tournament $tournament): void
    {
        if ($tournament->scoring_type === 'best_of_sets' && ! empty($match->sets)) {
            $this->buildSetEvents($match);
        } else {
            $this->buildPointEvents($match);
        }
    }

    // Mirrors MatchController::updateScore()'s live payload shape — one
    // 'point' event per scoring play, snapshotting the running score —
    // built up to the match's OWN already-final score_a/score_b, never a
    // freshly-rolled one, so a completed tournament's champion/records
    // stay exactly what they already were.
    private function buildPointEvents(GameMatch $match): void
    {
        $remainingA = $match->score_a ?? 0;
        $remainingB = $match->score_b ?? 0;
        $scoreA = 0;
        $scoreB = 0;
        $events = [];

        while ($remainingA > 0 || $remainingB > 0) {
            $side = $remainingA > 0 && ($remainingB === 0 || rand(0, 1) === 0) ? 'a' : 'b';
            $remaining = $side === 'a' ? $remainingA : $remainingB;
            $delta = min($remaining, rand(1, 3));

            if ($side === 'a') {
                $scoreA += $delta;
                $remainingA -= $delta;
            } else {
                $scoreB += $delta;
                $remainingB -= $delta;
            }

            $events[] = [
                'match_id' => $match->id,
                'type' => 'point',
                'payload' => json_encode(['score_a' => $scoreA, 'score_b' => $scoreB]),
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }

        if ($events === []) {
            // A 0-0 completed match (shouldn't normally happen, but stay
            // safe) still gets one event so "this match has a history" is
            // never a flat lie.
            $events[] = [
                'match_id' => $match->id,
                'type' => 'point',
                'payload' => json_encode(['score_a' => $match->score_a ?? 0, 'score_b' => $match->score_b ?? 0]),
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }

        MatchEvent::insert($events);
    }

    // Best-of-sets counterpart — one event per set already recorded on the
    // match's own `sets` column, mirroring MatchController::
    // updateSetsScore()'s payload shape exactly (cumulative sets array +
    // running sets-won tally), built from the EXISTING sets rather than
    // regenerating them.
    private function buildSetEvents(GameMatch $match): void
    {
        $setsWonA = 0;
        $setsWonB = 0;
        $cumulative = [];
        $events = [];

        foreach ($match->sets as $i => $set) {
            $cumulative[] = $set;
            if (($set['score_a'] ?? 0) > ($set['score_b'] ?? 0)) {
                $setsWonA++;
            } else {
                $setsWonB++;
            }

            $events[] = [
                'match_id' => $match->id,
                'type' => 'point',
                'payload' => json_encode(['score_a' => $setsWonA, 'score_b' => $setsWonB, 'sets' => $cumulative]),
                'created_at' => now()->addSeconds($i),
                'updated_at' => now()->addSeconds($i),
            ];
        }

        if ($events !== []) {
            MatchEvent::insert($events);
        }
    }
}
