<?php

namespace App\Http\Controllers;

use App\Models\News;
use App\Models\NewsComment;
use Illuminate\Http\Request;

class NewsCommentController extends Controller
{
    public function index(News $news)
    {
        return $news->comments()->with('user:id,name,avatar_path')->orderBy('created_at')->get();
    }

    public function store(Request $request, News $news)
    {
        $this->authorize('create', NewsComment::class);

        $data = $request->validate([
            'body' => ['required', 'string', 'max:1000'],
        ]);

        $comment = $news->comments()->create([
            'user_id' => $request->user()->id,
            'body' => $data['body'],
        ]);

        return response()->json($comment->load('user:id,name,avatar_path'), 201);
    }

    public function destroy(NewsComment $newsComment)
    {
        $this->authorize('delete', $newsComment);

        $newsComment->delete();

        return response()->noContent();
    }
}
