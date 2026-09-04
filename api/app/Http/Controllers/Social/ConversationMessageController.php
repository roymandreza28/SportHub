<?php

namespace App\Http\Controllers\Social;

use App\Events\ConversationMessageSent;
use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Support\Broadcasting;
use Illuminate\Http\Request;

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

        $message->load('user:id,name');

        Broadcasting::safely(fn () => ConversationMessageSent::dispatch($message));

        return response()->json($message, 201);
    }
}
