<?php

namespace App\Support;

// Maps a venue organizer's live-scoreboard stat key (PlayerStatFieldSets)
// to the coach stat sheet key (StatSheetFieldSets) that represents the
// exact same real-world number — only pairs confirmed to mean the same
// thing are listed here, never a fuzzy/guessed match. Basketball's
// organizer scoreboard only records what's realistic to track live and
// unambiguously (a made free throw/2PT/3PT shot, and personal fouls) —
// assists, steals, blocks, rebounds and shot attempts require closer
// in-game judgment than a venue organizer can reliably make, so those stay
// coach-only, hand-entered from game film/notes after the fact.
//
// A stat-sheet field with an entry here is never coach-editable —
// MatchStatSheetController excludes it from update()'s validation rules
// (so a coach's submission for it is silently dropped, never persisted)
// and always computes its value fresh from MatchPlayerStat at read time,
// the same "never trust stored/client data for what the server already
// knows live" principle MatchPlayerStat's own team_id derivation uses.
//
// Keyed the same way StatSheetFieldSets::for() is: Basketball/Volleyball
// (always team sports here, see that class's own doc comment) are
// format-agnostic, keyed under null; the racquet sports are keyed by
// SportFormat name since Singles/Doubles have different stat-sheet
// columns.
class PlayerStatSheetLinkage
{
    private const MAP = [
        'Basketball' => [
            null => [
                'fouls' => 'fouls', 'ft_made' => 'ft_made', 'fg2_made' => 'fg2_made', 'fg3_made' => 'fg3_made',
            ],
        ],
        'Volleyball' => [
            // "aces" (organizer) and "service_aces" (stat sheet) are the
            // same stat under different key names — everything else here
            // is an identical key on both sides.
            null => [
                'kills' => 'kills', 'errors' => 'errors', 'assists' => 'assists', 'digs' => 'digs',
                'aces' => 'service_aces',
            ],
        ],
        'Badminton' => [
            'Singles' => ['smash_winners' => 'smash_winners', 'net_kills' => 'net_kills', 'unforced_errors' => 'unforced_errors'],
            'Doubles' => ['smash_winners' => 'smash_winners', 'net_kills' => 'net_kills', 'unforced_errors' => 'unforced_errors'],
        ],
        'Pickleball' => [
            'Singles' => ['unforced_errors' => 'unforced_errors'],
            'Doubles' => ['net_points_won' => 'net_points_won', 'unforced_errors' => 'unforced_errors'],
        ],
        'Tennis' => [
            'Singles' => [
                'aces' => 'aces', 'winners' => 'winners', 'unforced_errors' => 'unforced_errors',
                'double_faults' => 'double_faults', 'points_won' => 'total_points_won',
            ],
            'Doubles' => ['unforced_errors' => 'unforced_errors', 'double_faults' => 'double_faults'],
        ],
        'Table Tennis' => [
            // The stat sheet's own Singles/Doubles configs spell this
            // field differently ("serve_points_won" vs "serves_points_won")
            // — not our inconsistency to fix here, just to map around.
            'Singles' => [
                'unforced_errors' => 'unforced_errors', 'forced_errors_won' => 'forced_errors_won',
                'service_points' => 'serve_points_won',
            ],
            'Doubles' => [
                'unforced_errors' => 'unforced_errors', 'forced_errors_won' => 'forced_errors_won',
                'service_points' => 'serves_points_won',
            ],
        ],
    ];

    /** @return array<string, string> organizer-side key => stat-sheet-side key */
    public static function for(string $sportName, ?string $formatName): array
    {
        $entry = self::MAP[$sportName] ?? null;
        if ($entry === null) {
            return [];
        }

        return $entry[$formatName] ?? $entry[null] ?? [];
    }

    /** @return string[] the stat-sheet field keys that are locked/auto-filled from the scoreboard */
    public static function lockedStatSheetKeys(string $sportName, ?string $formatName): array
    {
        return array_values(self::for($sportName, $formatName));
    }
}
