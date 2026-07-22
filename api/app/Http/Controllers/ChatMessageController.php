<?php

namespace App\Http\Controllers;

use App\Events\ChatMessageSent;
use App\Models\Livestream;
use Illuminate\Http\Request;

class ChatMessageController extends Controller
{
    public function index(Livestream $livestream)
    {
        return $livestream->chatMessages()
            ->with('user:id,name')
            ->orderBy('created_at')
            ->get();
    }

    public function store(Request $request, Livestream $livestream)
    {
        $data = $request->validate([
            'body' => ['required', 'string', 'max:500'],
        ]);

        $message = $livestream->chatMessages()->create([
            'user_id' => $request->user()->id,
            'body' => $data['body'],
        ]);

        $message->load('user:id,name');

        ChatMessageSent::dispatch($message);

        return response()->json($message, 201);
    }
}
