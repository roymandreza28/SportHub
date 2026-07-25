<?php

namespace App\Http\Controllers\Social;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ConversationController extends Controller
{
    public function index(Request $request)
    {
        return $request->user()->conversations()
            ->with(['participants:id,name', 'messages' => fn ($q) => $q->latest()->limit(1)])
            ->get()
            ->sortByDesc(fn (Conversation $c) => $c->messages->first()?->created_at ?? $c->created_at)
            ->values();
    }

    public function store(Request $request)
    {
        $this->authorize('create', Conversation::class);

        $data = $request->validate([
            'type' => ['required', 'in:direct,group'],
            'user_id' => ['required_if:type,direct', 'integer', 'exists:users,id'],
            'name' => ['required_if:type,group', 'string', 'max:255'],
            'participant_ids' => ['required_if:type,group', 'array', 'min:1'],
            'participant_ids.*' => ['integer', 'exists:users,id'],
        ]);

        $user = $request->user();
        $friendIds = $user->friends()->pluck('id');

        if ($data['type'] === 'direct') {
            $otherId = (int) $data['user_id'];

            abort_if($otherId === $user->id, 422, 'You cannot message yourself.');
            abort_unless($friendIds->contains($otherId), 422, 'You can only message friends.');

            return DB::transaction(function () use ($user, $otherId) {
                $directKey = Conversation::directKeyFor($user->id, $otherId);

                $conversation = Conversation::firstOrCreate(
                    ['direct_key' => $directKey],
                    ['type' => 'direct', 'created_by' => $user->id]
                );

                if ($conversation->wasRecentlyCreated) {
                    $conversation->participants()->attach([$user->id, $otherId]);
                }

                return response()->json($conversation->load('participants:id,name'), 201);
            });
        }

        $participantIds = collect($data['participant_ids'])->map(fn ($id) => (int) $id);
        $invalid = $participantIds->diff($friendIds);
        abort_if($invalid->isNotEmpty(), 422, 'You can only add friends to a group.');

        $conversation = Conversation::create([
            'type' => 'group',
            'name' => $data['name'],
            'created_by' => $user->id,
        ]);

        $conversation->participants()->attach($participantIds->push($user->id)->unique());

        return response()->json($conversation->load('participants:id,name'), 201);
    }

    public function markRead(Request $request, Conversation $conversation)
    {
        $this->authorize('view', $conversation);

        $conversation->participants()->updateExistingPivot($request->user()->id, ['last_read_at' => now()]);

        return response()->noContent();
    }

    public function addParticipant(Request $request, Conversation $conversation)
    {
        $this->authorize('addParticipant', $conversation);

        $data = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
        ]);

        $newUserId = (int) $data['user_id'];
        abort_unless($request->user()->friends()->pluck('id')->contains($newUserId), 422, 'You can only add friends.');

        $conversation->participants()->syncWithoutDetaching([$newUserId]);

        return $conversation->load('participants:id,name');
    }
}
