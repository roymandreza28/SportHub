<?php

namespace App\Support;

// Single source of truth for which sports support a coach stat sheet and
// what columns each one has — the frontend renders purely off the "fields"
// list this returns in MatchStatSheetController's response, so a new sport
// only ever needs a new entry here, never a matching frontend change.
//
// 'roster' mode (Basketball, Volleyball — both always team sports in this
// app's SportsSeeder) renders one row per accepted team member plus a
// computed team-totals row. 'summary' mode (the racquet sports) renders one
// aggregate "Value" row and one "Total %" row per participant instead, with
// no roster — singles matches have no Team to draw a roster from at all, and
// doubles' reference sheets report team-level, not per-player, numbers.
class StatSheetFieldSets
{
    private const CONFIG = [
        'Basketball' => [
            'mode' => 'roster',
            'fields' => [
                ['key' => 'fg2_att', 'label' => '2PT Att'],
                ['key' => 'fg2_made', 'label' => '2PT Made'],
                ['key' => 'fg3_att', 'label' => '3PT Att'],
                ['key' => 'fg3_made', 'label' => '3PT Made'],
                ['key' => 'ft_att', 'label' => 'FT Att'],
                ['key' => 'ft_made', 'label' => 'FT Made'],
                ['key' => 'reb_off', 'label' => 'Reb Off'],
                ['key' => 'reb_def', 'label' => 'Reb Def'],
                ['key' => 'assists', 'label' => 'Ast'],
                ['key' => 'steals', 'label' => 'Stl'],
                ['key' => 'blocks', 'label' => 'Blk'],
                ['key' => 'turnovers', 'label' => 'TO'],
                ['key' => 'fouls', 'label' => 'PF'],
            ],
        ],
        'Volleyball' => [
            'mode' => 'roster',
            'fields' => [
                ['key' => 'kills', 'label' => 'Kills'],
                ['key' => 'errors', 'label' => 'Errors'],
                ['key' => 'total_attacks', 'label' => 'Total Attacks'],
                ['key' => 'service_aces', 'label' => 'Service Aces'],
                ['key' => 'service_errors', 'label' => 'Service Errors'],
                ['key' => 'assists', 'label' => 'Assists'],
                ['key' => 'digs', 'label' => 'Digs'],
                ['key' => 'block_solos', 'label' => 'Block Solo'],
                ['key' => 'block_assists', 'label' => 'Block Assist'],
                ['key' => 'receptions', 'label' => 'Receptions'],
                ['key' => 'reception_3', 'label' => 'Reception Grade 3'],
                ['key' => 'reception_2', 'label' => 'Reception Grade 2'],
                ['key' => 'reception_1', 'label' => 'Reception Grade 1'],
                ['key' => 'reception_0', 'label' => 'Reception Grade 0'],
            ],
        ],
        'Badminton' => [
            'Singles' => [
                'mode' => 'summary',
                'fields' => [
                    ['key' => 'rally_win_rate', 'label' => 'Rally Win Rate'],
                    ['key' => 'smash_attempts', 'label' => 'Smash Attempts'],
                    ['key' => 'smash_winners', 'label' => 'Smash Winners'],
                    ['key' => 'smash_success_rate', 'label' => 'Smash Success Rate'],
                    ['key' => 'net_kill_attempts', 'label' => 'Net Kill Attempts'],
                    ['key' => 'net_kills', 'label' => 'Net Kills'],
                    ['key' => 'unforced_errors', 'label' => 'Unforced Errors'],
                    ['key' => 'unforced_error_rate', 'label' => 'Unforced Error Rate'],
                    ['key' => 'service_attempts', 'label' => 'Service Attempts'],
                    ['key' => 'service_accuracy', 'label' => 'Service Accuracy'],
                ],
            ],
            'Doubles' => [
                'mode' => 'summary',
                'fields' => [
                    ['key' => 'rally_win_rate', 'label' => 'Rally Win Rate'],
                    ['key' => 'smash_attempts', 'label' => 'Smash Attempts'],
                    ['key' => 'smash_winners', 'label' => 'Smash Winners'],
                    ['key' => 'smash_success_rate', 'label' => 'Smash Success Rate'],
                    ['key' => 'net_kills', 'label' => 'Net Kills'],
                    ['key' => 'net_kill_rate', 'label' => 'Net Kill Rate'],
                    ['key' => 'unforced_errors', 'label' => 'Unforced Errors'],
                    ['key' => 'forced_errors_won', 'label' => 'Forced Errors Won'],
                    ['key' => 'service_success', 'label' => 'Service Success'],
                ],
            ],
        ],
        'Pickleball' => [
            'Singles' => [
                'mode' => 'summary',
                'fields' => [
                    ['key' => 'rally_win_rate', 'label' => 'Rally Win Rate'],
                    ['key' => 'third_shot_drops', 'label' => '3rd Shot Drops'],
                    ['key' => 'third_shot_drives', 'label' => '3rd Shot Drives'],
                    ['key' => 'net_shots_won', 'label' => 'Net Shots Won'],
                    ['key' => 'smash_winners', 'label' => 'Smash Winners'],
                    ['key' => 'unforced_errors', 'label' => 'Unforced Errors'],
                    ['key' => 'forced_errors', 'label' => 'Forced Errors'],
                    ['key' => 'serve_accuracy', 'label' => 'Serve Accuracy'],
                ],
            ],
            'Doubles' => [
                'mode' => 'summary',
                'fields' => [
                    ['key' => 'rally_win_rate', 'label' => 'Rally Win Rate'],
                    ['key' => 'third_shot_drops', 'label' => '3rd Shot Drops'],
                    ['key' => 'net_points_won', 'label' => 'Net Points Won'],
                    ['key' => 'dink_battle_won', 'label' => 'Dink Battle Won'],
                    ['key' => 'smash_winners', 'label' => 'Smash Winners'],
                    ['key' => 'unforced_errors', 'label' => 'Unforced Errors'],
                    ['key' => 'forced_errors', 'label' => 'Forced Errors'],
                    ['key' => 'serve_success', 'label' => 'Serve Success'],
                    ['key' => 'attack_pct_at_net', 'label' => 'Attack % at Net'],
                ],
            ],
        ],
        'Tennis' => [
            'Singles' => [
                'mode' => 'summary',
                'fields' => [
                    ['key' => 'first_serve_in', 'label' => 'First Serve In'],
                    ['key' => 'aces', 'label' => 'Aces'],
                    ['key' => 'double_faults', 'label' => 'Double Faults'],
                    ['key' => 'first_serve_won', 'label' => '1st Serve Won'],
                    ['key' => 'second_serve_won', 'label' => '2nd Serve Won'],
                    ['key' => 'winners', 'label' => 'Winners'],
                    ['key' => 'unforced_errors', 'label' => 'Unforced Errors'],
                    ['key' => 'break_points', 'label' => 'Break Points'],
                    ['key' => 'total_points_won', 'label' => 'Total Points Won'],
                ],
            ],
            'Doubles' => [
                'mode' => 'summary',
                'fields' => [
                    ['key' => 'first_serve_in', 'label' => 'First Serve In'],
                    ['key' => 'first_serve_won', 'label' => '1st Serve Won'],
                    ['key' => 'second_serve_won', 'label' => '2nd Serve Won'],
                    ['key' => 'double_faults', 'label' => 'Double Faults'],
                    ['key' => 'net_points_won', 'label' => 'Net Points Won'],
                    ['key' => 'break_success_rate', 'label' => 'Break Success Rate'],
                    ['key' => 'unforced_errors', 'label' => 'Unforced Errors'],
                    ['key' => 'communication_shots_won', 'label' => 'Communication Shots Won'],
                ],
            ],
        ],
        'Table Tennis' => [
            'Singles' => [
                'mode' => 'summary',
                'fields' => [
                    ['key' => 'rally_win_rate', 'label' => 'Rally Win Rate'],
                    ['key' => 'serve_points_won', 'label' => 'Serve Points Won'],
                    ['key' => 'receive_points_won', 'label' => 'Receive Points Won'],
                    ['key' => 'forehand_winners', 'label' => 'Forehand Winners'],
                    ['key' => 'backhand_winners', 'label' => 'Backhand Winners'],
                    ['key' => 'unforced_errors', 'label' => 'Unforced Errors'],
                    ['key' => 'forced_errors_won', 'label' => 'Forced Errors Won'],
                    ['key' => 'spin_efficiency', 'label' => 'Spin Efficiency'],
                ],
            ],
            'Doubles' => [
                'mode' => 'summary',
                'fields' => [
                    ['key' => 'rally_win_rate', 'label' => 'Rally Win Rate'],
                    ['key' => 'serves_points_won', 'label' => 'Serves Points Won'],
                    ['key' => 'receive_points_won', 'label' => 'Receive Points Won'],
                    ['key' => 'forehand_winners', 'label' => 'Forehand Winners'],
                    ['key' => 'backhand_winners', 'label' => 'Backhand Winners'],
                    ['key' => 'unforced_errors', 'label' => 'Unforced Errors'],
                    ['key' => 'forced_errors_won', 'label' => 'Forced Errors Won'],
                    ['key' => 'spin_success_rate', 'label' => 'Spin Success Rate'],
                ],
            ],
        ],
    ];

    /**
     * @return array{mode: 'roster'|'summary', fields: array<int, array{key: string, label: string}>}|null
     */
    public static function for(string $sportName, ?string $formatName): ?array
    {
        $entry = self::CONFIG[$sportName] ?? null;
        if ($entry === null) {
            return null;
        }

        // Basketball/Volleyball are keyed directly (format-agnostic — 5v5,
        // 3v3, and 6v6 all use the same roster columns). Racquet sports are
        // keyed one level deeper, by the SportFormat's own "Singles"/
        // "Doubles" name, since those two variants have different columns.
        if (isset($entry['mode'])) {
            return $entry;
        }

        return $entry[$formatName] ?? null;
    }

    public static function supportedSportNames(): array
    {
        return array_keys(self::CONFIG);
    }
}
