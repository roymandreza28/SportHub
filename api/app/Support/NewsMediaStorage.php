<?php

namespace App\Support;

use App\Models\News;

// Extracted from NewsController::storeMedia() so TournamentController can attach
// the same title/context/photo/video post shape to a tournament announcement or
// champion congratulations without duplicating the storage logic.
class NewsMediaStorage
{
    public static function store(News $news, array $files): void
    {
        foreach (array_values($files) as $position => $file) {
            $type = str_starts_with($file->getMimeType(), 'video') ? 'video' : 'image';

            $news->media()->create([
                'type' => $type,
                'path' => $file->store('news/'.$news->id, 'public'),
                'position' => $position,
            ]);
        }
    }
}
