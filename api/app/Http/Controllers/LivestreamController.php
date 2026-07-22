<?php

namespace App\Http\Controllers;

use App\Models\Livestream;
use App\Models\News;
use App\Models\Tournament;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class LivestreamController extends Controller
{
    public function index()
    {
        return Livestream::orderByDesc('created_at')->get();
    }

    public function show(Livestream $livestream)
    {
        return $livestream;
    }

    public function store(Request $request)
    {
        $this->authorize('create', Livestream::class);

        $data = $request->validate([
            'news_id' => ['nullable', 'exists:news,id'],
            'tournament_id' => ['nullable', 'exists:tournaments,id'],
            'title' => ['required', 'string', 'max:255'],
            'platform' => ['required', 'in:youtube,facebook'],
            'embed_url' => ['required', 'string', 'max:500'],
        ]);

        $user = $request->user();

        if (! empty($data['tournament_id'])) {
            abort_unless(Tournament::findOrFail($data['tournament_id'])->organizer_id === $user->id, 403);
        }

        if (! empty($data['news_id'])) {
            abort_unless(News::findOrFail($data['news_id'])->author_id === $user->id, 403);
        }

        $livestream = Livestream::create([
            ...$data,
            'chat_channel_name' => 'livestream.'.Str::random(12),
            'status' => 'scheduled',
        ]);

        return response()->json($livestream, 201);
    }

    public function update(Request $request, Livestream $livestream)
    {
        $this->authorize('update', $livestream);

        $data = $request->validate([
            'title' => ['sometimes', 'string', 'max:255'],
            'embed_url' => ['sometimes', 'string', 'max:500'],
            'status' => ['sometimes', 'in:scheduled,live,ended'],
        ]);

        $livestream->update($data);

        return $livestream;
    }

    public function destroy(Livestream $livestream)
    {
        $this->authorize('delete', $livestream);

        $livestream->delete();

        return response()->noContent();
    }
}
