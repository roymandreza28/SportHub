<?php

namespace App\Http\Controllers\Social;

use App\Events\ConversationMessageSent;
use App\Http\Controllers\Controller;
use App\Models\Conversation;
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
            'body' => ['required', 'string', 'max:2000'],
        ]);

        $message = $conversation->messages()->create([
            'user_id' => $request->user()->id,
            'body' => $data['body'],
        ]);

        $message->load('user:id,name');

        ConversationMessageSent::dispatch($message);

        return response()->json($message, 201);
    }
}
