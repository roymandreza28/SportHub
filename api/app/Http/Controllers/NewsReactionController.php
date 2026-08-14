<?php

namespace App\Http\Controllers;

use App\Models\News;
use App\Models\NewsReaction;
use Illuminate\Http\Request;

class NewsReactionController extends Controller
{
    public function toggle(Request $request, News $news)
    {
        $this->authorize('create', NewsReaction::class);

        $user = $request->user();
        $reaction = NewsReaction::where('news_id', $news->id)->where('user_id', $user->id)->first();

        if ($reaction) {
            $reaction->delete();
        } else {
            NewsReaction::create(['news_id' => $news->id, 'user_id' => $user->id]);
        }

        return response()->json([
            'reacted' => ! $reaction,
            'reactions_count' => $news->reactions()->count(),
        ]);
    }
}
