<?php

namespace App\Services;

// Renders a square, sport-colored initials badge purely with GD — used as a
// team's logo (teams have no real crest to upload in this demo dataset) and
// as a player avatar's offline fallback when a stock photo can't be fetched
// (see TeamAndPlayerImagerySeeder). Zero network dependency, and, like
// NewsCoverCardGenerator, deterministic per input so re-seeding is stable.
class InitialsBadgeGenerator
{
    private const SIZE = 400;

    // Same per-sport gradient family as NewsCoverCardGenerator so a team's
    // logo and its tournament's newsfeed cover read as visually related,
    // without literally sharing the palette table (different value shape —
    // this one has no separate icon-color slot, initials are always white).
    private const PALETTES = [
        'Basketball' => [[234, 88, 12], [124, 45, 18]],
        'Volleyball' => [[8, 145, 178], [8, 51, 68]],
        'Badminton' => [[147, 51, 234], [59, 7, 100]],
        'Pickleball' => [[202, 138, 4], [113, 63, 18]],
        'Tennis' => [[101, 163, 13], [54, 83, 20]],
        'Table Tennis' => [[219, 39, 119], [112, 26, 117]],
    ];

    private const DEFAULT_PALETTE = [[13, 148, 136], [17, 60, 65]];

    public static function generate(string $seed, string $initials, ?string $sportName = null): string
    {
        [$top, $bottom] = self::PALETTES[$sportName] ?? self::DEFAULT_PALETTE;

        $image = imagecreatetruecolor(self::SIZE, self::SIZE);
        imagealphablending($image, true);

        self::paintGradient($image, self::pick($seed, $top), self::pick($seed, $bottom, 40));
        self::drawInitials($image, $initials);

        ob_start();
        imagejpeg($image, quality: 88);
        $bytes = (string) ob_get_clean();
        imagedestroy($image);

        return $bytes;
    }

    // Nudges the palette's two stops by a small hash-derived offset so teams
    // sharing a sport don't all get the exact same flat gradient.
    private static function pick(string $seed, array $rgb, int $jitter = 0): array
    {
        if ($jitter === 0) {
            return $rgb;
        }

        $offset = (crc32($seed) % ($jitter * 2)) - $jitter;

        return array_map(fn ($c) => max(0, min(255, $c + $offset)), $rgb);
    }

    private static function paintGradient($image, array $top, array $bottom): void
    {
        for ($y = 0; $y < self::SIZE; $y++) {
            $t = $y / self::SIZE;
            $r = (int) round($top[0] + ($bottom[0] - $top[0]) * $t);
            $g = (int) round($top[1] + ($bottom[1] - $top[1]) * $t);
            $b = (int) round($top[2] + ($bottom[2] - $top[2]) * $t);
            $color = imagecolorallocate($image, $r, $g, $b);
            imageline($image, 0, $y, self::SIZE, $y, $color);
        }
    }

    private static function drawInitials($image, string $initials): void
    {
        $white = imagecolorallocate($image, 255, 255, 255);
        $font = self::fontPath();
        $size = self::SIZE * 0.36;

        if ($font) {
            $box = imagettfbbox($size, 0, $font, $initials);
            $textWidth = $box[2] - $box[0];
            $textHeight = $box[1] - $box[7];
            $x = (int) ((self::SIZE - $textWidth) / 2);
            $y = (int) ((self::SIZE + $textHeight) / 2);
            imagettftext($image, $size, 0, $x, $y, $white, $font, $initials);

            return;
        }

        $x = (int) ((self::SIZE - strlen($initials) * imagefontwidth(5)) / 2);
        $y = (int) ((self::SIZE - imagefontheight(5)) / 2);
        imagestring($image, 5, $x, $y, $initials, $white);
    }

    private static function fontPath(): ?string
    {
        static $cache = null;
        if ($cache !== null) {
            return $cache ?: null;
        }

        $candidates = [
            '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
            '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
            'C:\\Windows\\Fonts\\arialbd.ttf',
        ];

        foreach ($candidates as $candidate) {
            if (is_file($candidate)) {
                return $cache = $candidate;
            }
        }

        $cache = '';

        return null;
    }

    /** Builds a 1-2 letter monogram from a name — "Riverside Ballers" -> "RB", "Josef Reyes" -> "JR". */
    public static function initialsFor(string $name): string
    {
        $words = preg_split('/\s+/', trim($name)) ?: [];
        $letters = array_map(fn ($w) => mb_strtoupper(mb_substr($w, 0, 1)), array_filter($words));

        if ($letters === []) {
            return '?';
        }

        return implode('', array_slice($letters, 0, 2));
    }
}
