<?php

namespace App\Support;

// Defines the 5 "pentagon" career-stat axes the venue organizer's live
// scoreboard tracks per player, per sport — single source of truth shipped
// to the frontend in ProfileController::statSummary()'s response (mirroring
// StatSheetFieldSets' shape), so PlayerStatsPentagon.tsx never hardcodes a
// parallel config. Basketball and Basketball 3x3 share one entry since
// they're the same Sport row (3x3 is only a SportFormat, per SportsSeeder).
class PlayerStatFieldSets
{
    private const CONFIG = [
        'Basketball' => [
            ['key' => 'points', 'label' => 'Points', 'is_axis' => true, 'scale_max' => 500],
            ['key' => 'rebounds', 'label' => 'Rebounds', 'is_axis' => true, 'scale_max' => 200],
            ['key' => 'assists', 'label' => 'Assists', 'is_axis' => true, 'scale_max' => 150],
            ['key' => 'steals', 'label' => 'Steals', 'is_axis' => true, 'scale_max' => 80],
            ['key' => 'blocks', 'label' => 'Blocks', 'is_axis' => true, 'scale_max' => 80],
            ['key' => 'fouls', 'label' => 'Fouls', 'is_axis' => false, 'scale_max' => 0],
        ],
        'Volleyball' => [
            ['key' => 'kills', 'label' => 'Kills', 'is_axis' => true, 'scale_max' => 200],
            ['key' => 'blocks', 'label' => 'Blocks', 'is_axis' => true, 'scale_max' => 100],
            ['key' => 'aces', 'label' => 'Aces', 'is_axis' => true, 'scale_max' => 60],
            ['key' => 'digs', 'label' => 'Digs', 'is_axis' => true, 'scale_max' => 200],
            ['key' => 'assists', 'label' => 'Assists', 'is_axis' => true, 'scale_max' => 150],
            ['key' => 'errors', 'label' => 'Errors', 'is_axis' => false, 'scale_max' => 0],
        ],
        'Badminton' => [
            ['key' => 'points_won', 'label' => 'Points Won', 'is_axis' => true, 'scale_max' => 1000],
            ['key' => 'smash_winners', 'label' => 'Smash Winners', 'is_axis' => true, 'scale_max' => 150],
            ['key' => 'net_kills', 'label' => 'Net Kills', 'is_axis' => true, 'scale_max' => 150],
            ['key' => 'aces', 'label' => 'Aces', 'is_axis' => true, 'scale_max' => 100],
            ['key' => 'unforced_errors', 'label' => 'Unforced Errors', 'is_axis' => true, 'scale_max' => 300],
        ],
        'Pickleball' => [
            ['key' => 'points_won', 'label' => 'Points Won', 'is_axis' => true, 'scale_max' => 1000],
            ['key' => 'winners', 'label' => 'Winners', 'is_axis' => true, 'scale_max' => 200],
            ['key' => 'net_points_won', 'label' => 'Net Points Won', 'is_axis' => true, 'scale_max' => 200],
            ['key' => 'unforced_errors', 'label' => 'Unforced Errors', 'is_axis' => true, 'scale_max' => 300],
            ['key' => 'faults', 'label' => 'Faults', 'is_axis' => true, 'scale_max' => 200],
        ],
        'Tennis' => [
            ['key' => 'points_won', 'label' => 'Points Won', 'is_axis' => true, 'scale_max' => 1000],
            ['key' => 'aces', 'label' => 'Aces', 'is_axis' => true, 'scale_max' => 100],
            ['key' => 'winners', 'label' => 'Winners', 'is_axis' => true, 'scale_max' => 200],
            ['key' => 'unforced_errors', 'label' => 'Unforced Errors', 'is_axis' => true, 'scale_max' => 300],
            ['key' => 'double_faults', 'label' => 'Double Faults', 'is_axis' => true, 'scale_max' => 100],
        ],
        'Table Tennis' => [
            ['key' => 'points_won', 'label' => 'Points Won', 'is_axis' => true, 'scale_max' => 1000],
            ['key' => 'winners', 'label' => 'Winners', 'is_axis' => true, 'scale_max' => 200],
            ['key' => 'service_points', 'label' => 'Service Points', 'is_axis' => true, 'scale_max' => 150],
            ['key' => 'unforced_errors', 'label' => 'Unforced Errors', 'is_axis' => true, 'scale_max' => 300],
            ['key' => 'forced_errors_won', 'label' => 'Forced Errors Won', 'is_axis' => true, 'scale_max' => 150],
        ],
    ];

    /** @return array<int, array{key: string, label: string, is_axis: bool, scale_max: int}>|null */
    public static function for(string $sportName): ?array
    {
        return self::CONFIG[$sportName] ?? null;
    }

    /** @return array<int, array{key: string, label: string, scale_max: int}> */
    public static function pentagonAxesFor(string $sportName): array
    {
        $fields = self::CONFIG[$sportName] ?? [];

        return array_values(array_map(
            fn ($f) => ['key' => $f['key'], 'label' => $f['label'], 'scale_max' => $f['scale_max']],
            array_filter($fields, fn ($f) => $f['is_axis'])
        ));
    }

    public static function supportedSportNames(): array
    {
        return array_keys(self::CONFIG);
    }
}
