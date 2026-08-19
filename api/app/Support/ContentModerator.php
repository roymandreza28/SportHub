<?php

namespace App\Support;

// A word-list filter, not ML-based moderation — this catches plain, common
// profanity/sexual-content terms in English and Tagalog and basic repeat-
// letter obfuscation ("fuuuck"), but won't catch creative misspellings,
// leetspeak substitutions, or terms outside this list. There's no existing
// moderation infrastructure anywhere in this codebase to build on, so this
// is intentionally a simple, auditable starting point rather than a bigger
// NLP/ML system.
class ContentModerator
{
    private const BANNED_TERMS = [
        // English profanity / slurs / sexual content
        'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bullshit', 'bitch',
        'asshole', 'ass', 'dick', 'pussy', 'cunt', 'bastard', 'whore', 'slut',
        'nigger', 'nigga', 'faggot', 'retard', 'cock', 'penis', 'vagina', 'sex',
        'porn', 'rape', 'blowjob', 'handjob', 'cum', 'jerkoff', 'wanker', 'twat',

        // Tagalog profanity / sexual content
        'putangina', 'putanginamo', 'putang ina', 'puta', 'putok', 'gago', 'gaga',
        'tangina', 'tang ina', 'tarantado', 'ulol', 'ulul', 'bobo', 'tanga',
        'leche', 'lintik', 'punyeta', 'peste', 'hayop', 'hayup', 'kupal',
        'kantot', 'kantutan', 'iyot', 'jakol', 'salsal', 'titi', 'puke', 'pekpek',
        'burat', 'bayag', 'etits', 'tite', 'bilat',
    ];

    public static function isInappropriate(string $text): bool
    {
        $normalized = self::normalize($text);

        foreach (self::BANNED_TERMS as $term) {
            $pattern = '/(?<![\p{L}\p{N}])'.preg_quote($term, '/').'(?![\p{L}\p{N}])/ui';

            if (preg_match($pattern, $normalized) === 1) {
                return true;
            }
        }

        return false;
    }

    private static function normalize(string $text): string
    {
        $text = mb_strtolower($text);

        // Collapse 3+ repeated characters down to 1 ("fuuuuck" -> "fuck",
        // "shiiiit" -> "shit") without mangling legitimate words that just
        // happen to double a letter.
        return preg_replace('/(.)\1{2,}/u', '$1', $text);
    }
}
