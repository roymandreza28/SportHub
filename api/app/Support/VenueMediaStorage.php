<?php

namespace App\Support;

use App\Models\Venue;

// Mirrors NewsMediaStorage's shape — a venue's photo gallery, images only
// (a venue listing has no equivalent use for video the way a news post
// does). Appends after whatever photos already exist rather than always
// starting at position 0, so uploading more photos to an already-
// photographed venue doesn't collide with or reorder the existing ones.
class VenueMediaStorage
{
    public static function store(Venue $venue, array $files): void
    {
        if ($files === []) {
            return;
        }

        $position = ((int) $venue->media()->max('position')) + 1;

        foreach (array_values($files) as $i => $file) {
            $venue->media()->create([
                'path' => $file->store('venues/'.$venue->id, 'public'),
                'position' => $position + $i,
            ]);
        }
    }
}
