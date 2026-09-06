<?php

namespace App\Services;

// Renders a newsfeed post's cover photo locally with GD instead of fetching
// a generic stock photo from an external API (LoremFlickr, previously) — a
// stock photo pool only has a handful of images per sport, so same-sport
// posts ended up looking repeated, and depending on an external HTTP call at
// seed time is also one more thing that can fail or vanish (the storage
// bug this replaces a symptom of). Every card here is instead built purely
// from that post's own title/sport/tournament, so it's both unique per post
// and has zero network dependency.
class NewsCoverCardGenerator
{
    private const WIDTH = 800;

    private const HEIGHT = 450;

    // [top, bottom, accent] RGB per sport — a distinct gradient + accent so
    // a card reads as "this sport" at a glance without needing a photo.
    private const PALETTES = [
        'Basketball' => [[234, 88, 12], [124, 45, 18], [255, 255, 255]],
        'Volleyball' => [[8, 145, 178], [8, 51, 68], [255, 255, 255]],
        'Badminton' => [[147, 51, 234], [59, 7, 100], [255, 255, 255]],
        'Pickleball' => [[202, 138, 4], [113, 63, 18], [255, 255, 255]],
        'Tennis' => [[101, 163, 13], [54, 83, 20], [255, 255, 255]],
        'Table Tennis' => [[219, 39, 119], [112, 26, 117], [255, 255, 255]],
    ];

    // SportHub's own teal brand accent — used for every non-sport-specific
    // post (welcome message, facility updates, etc.) rather than an
    // arbitrary default, so those still look intentionally "on brand".
    private const DEFAULT_PALETTE = [[13, 148, 136], [17, 60, 65], [255, 255, 255]];

    public static function generate(string $title, ?string $sportName, ?string $subtitle = null): string
    {
        // DejaVuSans/Arial (the only fonts available to draw with — see
        // fontPath()) have no emoji glyphs; imagettftext renders each one as
        // garbled tofu boxes rather than skipping it cleanly. Titles/bodies
        // keep their real emoji in the database and everywhere else in the
        // app — this only cleans the copy baked into the generated image.
        $title = self::stripEmoji($title);
        $subtitle = $subtitle !== null ? self::stripEmoji($subtitle) : null;

        // Deliberately no imageantialias() here — GD's antialiasing mode
        // doesn't compose correctly with alpha-blended draws (confirmed by
        // hand: it turns the scrim's intended soft gradient into a hard cut
        // to solid black), and the scrim below depends on real per-pixel
        // alpha blending.
        $image = imagecreatetruecolor(self::WIDTH, self::HEIGHT);
        imagealphablending($image, true);

        [$top, $bottom, $iconColor] = self::PALETTES[$sportName] ?? self::DEFAULT_PALETTE;

        self::paintGradient($image, $top, $bottom);
        self::drawSportBadge($image, $sportName, $iconColor);
        self::drawScrim($image);
        self::drawWordmark($image);

        $textTop = self::HEIGHT - 190;
        if ($subtitle) {
            $textTop += self::drawSubtitle($image, $subtitle);
        }
        self::drawTitle($image, $title, $textTop);

        ob_start();
        imagejpeg($image, quality: 85);
        $bytes = (string) ob_get_clean();
        imagedestroy($image);

        return $bytes;
    }

    private static function stripEmoji(string $text): string
    {
        $stripped = preg_replace(
            '/[\x{1F300}-\x{1FAFF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{FE0F}\x{200D}]/u',
            '',
            $text
        ) ?? $text;

        return trim(preg_replace('/\s+/', ' ', $stripped) ?? $stripped);
    }

    private static function paintGradient($image, array $top, array $bottom): void
    {
        for ($y = 0; $y < self::HEIGHT; $y++) {
            $t = $y / self::HEIGHT;
            $r = (int) round($top[0] + ($bottom[0] - $top[0]) * $t);
            $g = (int) round($top[1] + ($bottom[1] - $top[1]) * $t);
            $b = (int) round($top[2] + ($bottom[2] - $top[2]) * $t);
            $color = imagecolorallocate($image, $r, $g, $b);
            imageline($image, 0, $y, self::WIDTH, $y, $color);
        }
    }

    // A dark bottom-up gradient so white title text stays legible regardless
    // of how light the sport's own palette is at that point in the image.
    private static function drawScrim($image): void
    {
        $bandHeight = 260;
        $startY = self::HEIGHT - $bandHeight;

        for ($y = $startY; $y < self::HEIGHT; $y++) {
            $t = ($y - $startY) / $bandHeight;
            $alpha = (int) round(90 * (1 - (1 - $t) ** 2));
            $color = imagecolorallocatealpha($image, 0, 0, 0, 127 - $alpha);
            imageline($image, 0, $y, self::WIDTH, $y, $color);
        }
    }

    private static function drawWordmark($image): void
    {
        $white = imagecolorallocatealpha($image, 255, 255, 255, 40);
        self::text($image, 'SportHub', 15, self::WIDTH - 130, self::HEIGHT - 22, $white);
    }

    // A pill badge (icon + sport name, all-caps) top-left — the clearest,
    // most literal "what sport is this" signal on the card.
    private static function drawSportBadge($image, ?string $sportName, array $iconColor): void
    {
        $cx = 60;
        $cy = 60;
        $radius = 34;

        $badgeBg = imagecolorallocatealpha($image, 255, 255, 255, 100);
        imagefilledellipse($image, $cx, $cy, $radius * 2 + 8, $radius * 2 + 8, $badgeBg);

        $ink = imagecolorallocate($image, ...$iconColor);
        self::drawSportIcon($image, $sportName, $cx, $cy, $radius, $ink);

        if ($sportName) {
            $white = imagecolorallocate($image, 255, 255, 255);
            self::text($image, strtoupper($sportName), 16, $cx + $radius + 16, $cy + 6, $white);
        }
    }

    private static function drawSportIcon($image, ?string $sportName, int $cx, int $cy, int $r, int $color): void
    {
        imagesetthickness($image, 3);

        match ($sportName) {
            'Basketball' => self::iconBasketball($image, $cx, $cy, $r, $color),
            'Volleyball' => self::iconVolleyball($image, $cx, $cy, $r, $color),
            'Badminton' => self::iconShuttlecock($image, $cx, $cy, $r, $color),
            'Pickleball' => self::iconPickleball($image, $cx, $cy, $r, $color),
            'Tennis' => self::iconTennis($image, $cx, $cy, $r, $color),
            'Table Tennis' => self::iconPaddle($image, $cx, $cy, $r, $color),
            default => self::iconStar($image, $cx, $cy, $r, $color),
        };

        imagesetthickness($image, 1);
    }

    private static function iconBasketball($image, int $cx, int $cy, int $r, int $c): void
    {
        $d = (int) ($r * 1.5);
        imageellipse($image, $cx, $cy, $d, $d, $c);
        imageline($image, $cx, (int) ($cy - $d / 2), $cx, (int) ($cy + $d / 2), $c);
        imageline($image, (int) ($cx - $d / 2), $cy, (int) ($cx + $d / 2), $cy, $c);
        imagearc($image, $cx - (int) ($d * 0.3), $cy, $d, $d, 290, 70, $c);
        imagearc($image, $cx + (int) ($d * 0.3), $cy, $d, $d, 110, 250, $c);
    }

    private static function iconVolleyball($image, int $cx, int $cy, int $r, int $c): void
    {
        $d = (int) ($r * 1.5);
        imageellipse($image, $cx, $cy, $d, $d, $c);
        imagearc($image, $cx, $cy - (int) ($d * 0.25), $d, (int) ($d * 0.7), 200, 340, $c);
        imagearc($image, $cx, $cy + (int) ($d * 0.25), $d, (int) ($d * 0.7), 20, 160, $c);
        imagearc($image, $cx - (int) ($d * 0.35), $cy, (int) ($d * 0.5), $d, 0, 180, $c);
    }

    private static function iconShuttlecock($image, int $cx, int $cy, int $r, int $c): void
    {
        $coneTop = $cy - $r;
        $coneBottom = $cy;
        $half = (int) ($r * 0.65);
        imagefilledpolygon($image, [
            $cx, $coneTop,
            $cx - $half, $coneBottom,
            $cx + $half, $coneBottom,
        ], $c);
        imagefilledellipse($image, $cx, $coneBottom + (int) ($r * 0.3), (int) ($r * 0.6), (int) ($r * 0.45), $c);
    }

    private static function iconPickleball($image, int $cx, int $cy, int $r, int $c): void
    {
        $d = (int) ($r * 1.5);
        imageellipse($image, $cx, $cy, $d, $d, $c);
        foreach ([[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]] as [$dx, $dy]) {
            imagefilledellipse($image, $cx + $dx * (int) ($r * 0.35), $cy + $dy * (int) ($r * 0.35), 6, 6, $c);
        }
    }

    private static function iconTennis($image, int $cx, int $cy, int $r, int $c): void
    {
        $d = (int) ($r * 1.5);
        imageellipse($image, $cx, $cy, $d, $d, $c);
        imagearc($image, $cx - (int) ($d * 0.45), $cy - (int) ($d * 0.1), $d, $d, 300, 60, $c);
        imagearc($image, $cx + (int) ($d * 0.45), $cy + (int) ($d * 0.1), $d, $d, 120, 240, $c);
    }

    private static function iconPaddle($image, int $cx, int $cy, int $r, int $c): void
    {
        imagefilledellipse($image, $cx - (int) ($r * 0.2), $cy - (int) ($r * 0.25), (int) ($r * 1.3), (int) ($r * 1.3), $c);
        imagefilledrectangle($image, $cx + (int) ($r * 0.15), $cy + (int) ($r * 0.3), $cx + (int) ($r * 0.35), $cy + $r, $c);
        imagefilledellipse($image, $cx - (int) ($r * 0.9), $cy + (int) ($r * 0.7), (int) ($r * 0.35), (int) ($r * 0.35), $c);
    }

    private static function iconStar($image, int $cx, int $cy, int $r, int $c): void
    {
        $points = [];
        for ($i = 0; $i < 10; $i++) {
            $angle = -M_PI / 2 + $i * M_PI / 5;
            $radius = $i % 2 === 0 ? $r * 0.8 : $r * 0.35;
            $points[] = $cx + (int) round(cos($angle) * $radius);
            $points[] = $cy + (int) round(sin($angle) * $radius);
        }
        imagefilledpolygon($image, $points, $c);
    }

    // Returns the vertical space it consumed, so drawTitle() can start below it.
    private static function drawSubtitle($image, string $subtitle): int
    {
        $accent = imagecolorallocatealpha($image, 255, 255, 255, 60);
        $y = self::HEIGHT - 210;
        self::text($image, strtoupper($subtitle), 14, 40, $y, $accent);

        return 34;
    }

    private static function drawTitle($image, string $title, int $top): void
    {
        $white = imagecolorallocate($image, 255, 255, 255);
        $fontSize = 30;
        $maxWidth = self::WIDTH - 80;
        $lines = self::wrapLines($title, $fontSize, $maxWidth, 3);

        $lineHeight = 40;
        $y = $top;
        foreach ($lines as $line) {
            self::text($image, $line, $fontSize, 40, $y, $white, bold: true);
            $y += $lineHeight;
        }
    }

    /** @return string[] */
    private static function wrapLines(string $text, float $size, int $maxWidth, int $maxLines): array
    {
        $words = preg_split('/\s+/', trim($text)) ?: [];
        $lines = [];
        $current = '';

        foreach ($words as $word) {
            $candidate = $current === '' ? $word : "{$current} {$word}";
            if (self::textWidth($candidate, $size) > $maxWidth && $current !== '') {
                $lines[] = $current;
                $current = $word;
                if (count($lines) === $maxLines) {
                    break;
                }
            } else {
                $current = $candidate;
            }
        }

        if ($current !== '' && count($lines) < $maxLines) {
            $lines[] = $current;
        }

        $consumedWords = array_sum(array_map(fn ($l) => count(explode(' ', $l)), $lines));
        if (count($lines) === $maxLines && $consumedWords < count($words)) {
            $lines[array_key_last($lines)] = rtrim($lines[array_key_last($lines)]).'…';
        }

        return $lines;
    }

    private static function textWidth(string $text, float $size): float
    {
        $font = self::fontPath();
        if ($font) {
            $box = imagettfbbox($size, 0, $font, $text);

            return $box[2] - $box[0];
        }

        return strlen($text) * (imagefontwidth(5) + 1);
    }

    private static function text($image, string $text, float $size, int $x, int $y, int $color, bool $bold = false): void
    {
        $font = self::fontPath($bold);
        if ($font) {
            imagettftext($image, $size, 0, $x, $y, $color, $font, $text);

            return;
        }

        // No TTF font available in this environment (should only happen
        // outside the Docker image / a dev machine with no system fonts) —
        // still renders something legible rather than silently drawing
        // nothing, just without wrapping/weight fidelity.
        imagestring($image, 5, $x, $y - 14, $text, $color);
    }

    private static function fontPath(bool $bold = true): ?string
    {
        static $cache = [];
        $key = $bold ? 'bold' : 'regular';
        if (array_key_exists($key, $cache)) {
            return $cache[$key];
        }

        $candidates = $bold
            ? [
                '/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf',
                '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
                'C:\\Windows\\Fonts\\arialbd.ttf',
            ]
            : [
                '/usr/share/fonts/dejavu/DejaVuSans.ttf',
                '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
                'C:\\Windows\\Fonts\\arial.ttf',
            ];

        foreach ($candidates as $candidate) {
            if (is_file($candidate)) {
                return $cache[$key] = $candidate;
            }
        }

        return $cache[$key] = null;
    }
}
