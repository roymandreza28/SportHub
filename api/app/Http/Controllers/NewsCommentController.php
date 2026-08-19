<?php

namespace App\Http\Controllers;

use App\Models\News;
use App\Models\NewsComment;
use App\Support\ContentModerator;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

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

        // Checked before the comment is ever created — "auto removed" means
        // it never sticks, not a moderate-then-delete pass afterward.
        if (ContentModerator::isInappropriate($data['body'])) {
            throw ValidationException::withMessages([
                'body' => ['Your comment contains inappropriate language and cannot be posted.'],
            ]);
        }

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
