<?php

namespace App\Http\Controllers\Social;

use App\Events\ConversationMessageSent;
use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Support\Broadcasting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ConversationMessageController extends Controller
{
    public function index(Request $request, Conversation $conversation)
    {
        $this->authorize('view', $conversation);

        return $conversation->messages()->with('user:id,name')->orderBy('created_at')->paginate(30);
    }

    public function store(Request $request, Conversation $conversation)
    {
        $this->authorize('sendMessage', $conversation);

        // Blocked is stored on whichever participant's own row set it (see
        // ConversationController::block()) — either side blocking silences
        // both directions in a direct conversation, so this checks the
        // WHOLE pivot for the thread, not just the sender's own row.
        if ($conversation->type === 'direct') {
            $blocked = $conversation->participants()->wherePivotNotNull('blocked_at')->exists();
            abort_if($blocked, 403, 'You can\'t send messages in this conversation.');
        }

        $data = $request->validate([
            // Either a caption or a photo (e.g. a GCash down-payment
            // screenshot for a booking conversation) is enough on its own —
            // the old text-only requirement would otherwise force typing
            // something just to attach an image.
            'body' => ['required_without:attachment', 'nullable', 'string', 'max:2000'],
            'attachment' => ['required_without:body', 'nullable', 'image', 'max:5120'],
        ]);

        $message = $conversation->messages()->create([
            'user_id' => $request->user()->id,
            'body' => $data['body'] ?? '',
            'attachment_path' => $request->hasFile('attachment')
                ? $request->file('attachment')->store('conversations/'.$conversation->id, 'public')
                : null,
        ]);

        // New activity un-hides/un-archives the thread for EVERY
        // participant (including the sender, if they'd archived their own
        // copy) — mirrors Messenger: archiving or deleting a chat only
        // holds until something new happens in it.
        DB::table('conversation_participants')
            ->where('conversation_id', $conversation->id)
            ->update(['archived_at' => null, 'hidden_at' => null]);

        $message->load('user:id,name');

        Broadcasting::safely(fn () => ConversationMessageSent::dispatch($message));

        return response()->json($message, 201);
    }
}
