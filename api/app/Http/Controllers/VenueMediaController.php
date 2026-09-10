<?php

namespace App\Http\Controllers;

use App\Models\Venue;
use App\Models\VenueMedia;
use App\Support\VenueMediaStorage;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class VenueMediaController extends Controller
{
    // Separate from VenueController::store()/update() (like ProfileController::
    // updateCover() is separate from updating the rest of a profile) — the
    // facilitator picks photos at venue-creation time and again whenever
    // editing later, both times as an immediate upload rather than bundled
    // into the venue's other fields, so this one small endpoint covers both.
    public function store(Request $request, Venue $venue)
    {
        $this->authorize('update', $venue);

        $request->validate([
            'media' => ['required', 'array', 'min:1'],
            'media.*' => ['file', 'image', 'mimetypes:image/jpeg,image/png,image/webp', 'max:5120'],
        ]);

        VenueMediaStorage::store($venue, $request->file('media', []));

        return $venue->fresh('media')->media;
    }

    public function destroy(VenueMedia $venueMedia)
    {
        $this->authorize('update', $venueMedia->venue);

        Storage::disk('public')->delete($venueMedia->path);
        $venueMedia->delete();

        return response()->noContent();
    }
}
