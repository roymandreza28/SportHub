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

        return Post::where('user_id', $userId)->latest()->paginate(20);
    }

    public function store(Request $request)
    {
        $this->authorize('create', Post::class);

        $data = $request->validate([
            'image' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
            'caption' => ['nullable', 'string', 'max:1000'],
        ]);

        $path = $request->file('image')->store('posts/'.$request->user()->id, 'public');

        $post = Post::create([
            'user_id' => $request->user()->id,
            'image_path' => $path,
            'caption' => $data['caption'] ?? null,
        ]);

        return response()->json($post, 201);
    }

    public function destroy(Request $request, Post $post)
    {
        $this->authorize('delete', $post);

        Storage::disk('public')->delete($post->image_path);
        $post->delete();

        return response()->noContent();
    }
}
