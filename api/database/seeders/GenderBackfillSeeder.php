<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

// Every demo player/coach seeder already sets 'gender' on the users it
// CREATES (see DatabaseSeeder, SampleDataSeeder, ExtendedTournamentsSeeder,
// MalePlayerTopUpSeeder), but an environment whose accounts were created
// before the gender migration/feature existed — or restored from a dump
// taken before it — never got those values backfilled after the fact. This
// seeder applies the exact same email -> gender mapping already verified
// correct in this session (name-analyzed once, by hand, not re-derived
// here) to whichever of those accounts actually exist on THIS database.
// Purely a data fix: only updates an existing user's gender, never creates
// an account, so it's safe to run on any environment (a fresh one, one
// that already has correct values, or one that's missing them) and safe to
// leave in a boot-time opt-in flag across multiple boots.
class GenderBackfillSeeder extends Seeder
{
    public function run(): void
    {
        $map = json_decode(file_get_contents(__DIR__.'/data/player_gender_map.json'), true);

        $updated = 0;
        foreach ($map as $email => $gender) {
            $user = User::where('email', $email)->first();
            if (! $user || $user->gender === $gender) {
                continue;
            }
            $user->update(['gender' => $gender]);
            $updated++;
        }

        $this->command?->info("Gender backfill: updated {$updated} of ".count($map).' known demo accounts (others already correct or not present on this database).');
    }
}
