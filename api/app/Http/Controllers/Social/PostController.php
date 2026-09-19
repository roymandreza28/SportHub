<?php

namespace App\Http\Controllers\Social;

use App\Http\Controllers\Controller;
use App\Models\Post;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class PostController extends Controller
{
    public function index(Request $request)
    {
        $userId = $request->integer('user_id') ?: $request->user()->id;
        $target = User::findOrFail($userId);
        abort_unless($target->hasAnyRole(['player', 'coach']), 404);

        return Post::where('user_id', $userId)->with('media')->latest()->paginate(20);
    }

    public function store(Request $request)
    {
        $this->authorize('create', Post::class);

        $data = $request->validate([
            // Instagram-style carousel post — 1 to 10 images, uploaded and
            // displayed in the order they're attached (position = array
            // index, same convention as News/NewsMediaStorage).
            'images' => ['required', 'array', 'min:1', 'max:10'],
            'images.*' => ['image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
            'caption' => ['nullable', 'string', 'max:1000'],
        ]);

        $post = Post::create([
            'user_id' => $request->user()->id,
            'caption' => $data['caption'] ?? null,
        ]);

        foreach (array_values($request->file('images')) as $position => $file) {
            $post->media()->create([
                'path' => $file->store('posts/'.$request->user()->id, 'public'),
                'position' => $position,
            ]);
        }

        return response()->json($post->load('media'), 201);
    }

    public function destroy(Request $request, Post $post)
    {
        $this->authorize('delete', $post);

        foreach ($post->media as $media) {
            Storage::disk('public')->delete($media->path);
        }

        // Cascades to post_media via the FK's onDelete('cascade'), but the
        // files themselves still need deleting from disk first — the
        // cascade only drops the DB rows, not the stored images.
        $post->delete();

        return response()->noContent();
    }
}
