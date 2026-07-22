<?php

namespace App\Http\Controllers;

use App\Models\News;
use Illuminate\Http\Request;

class NewsController extends Controller
{
    public function index()
    {
        return News::whereNotNull('published_at')
            ->with('author:id,name')
            ->orderByDesc('published_at')
            ->get();
    }

    public function show(News $news)
    {
        return $news->load('author:id,name', 'livestreams');
    }

    public function store(Request $request)
    {
        $this->authorize('create', News::class);

        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'body' => ['required', 'string'],
            'cover_image_url' => ['nullable', 'string', 'max:500'],
            'published_at' => ['nullable', 'date'],
        ]);

        $news = $request->user()->news()->create([
            ...$data,
            'published_at' => $data['published_at'] ?? now(),
        ]);

        return response()->json($news, 201);
    }

    public function update(Request $request, News $news)
    {
        $this->authorize('update', $news);

        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:255'],
            'body' => ['sometimes', 'string'],
            'cover_image_url' => ['nullable', 'string', 'max:500'],
            'published_at' => ['nullable', 'date'],
        ]);

        $news->update($data);

        return $news;
    }

    public function destroy(News $news)
    {
        $this->authorize('delete', $news);

        $news->delete();

        return response()->noContent();
    }
}
