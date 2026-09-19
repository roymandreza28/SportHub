<?php

namespace App\Events;

use App\Models\ConversationMessage;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ConversationMessageSent implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public ConversationMessage $message) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('conversation.'.$this->message->conversation_id)];
    }

    public function broadcastAs(): string
    {
        return 'ConversationMessageSent';
    }

    public function broadcastWith(): array
    {
        return [
            'id' => $this->message->id,
            'body' => $this->message->body,
            'attachment_url' => $this->message->attachment_url,
            'conversation_id' => $this->message->conversation_id,
            'user' => ['id' => $this->message->user->id, 'name' => $this->message->user->name],
            'created_at' => $this->message->created_at,
            // Every field the store()/index() JSON already carries for
            // these — without them here, a live-pushed message would look
            // fully intact on every OTHER open tab until their next
            // refetch, even after being removed or pinned on this one (see
            // GlobalChatListener's own comment on why it now replaces, not
            // skips, an already-known message id).
            'removed_at' => $this->message->removed_at,
            'pinned_at' => $this->message->pinned_at,
            'reply_to' => $this->quoteFor($this->message->replyTo),
            'forwarded_from' => $this->quoteFor($this->message->forwardedFrom),
        ];
    }

    private function quoteFor(?ConversationMessage $quoted): ?array
    {
        if (! $quoted) {
            return null;
        }

        return [
            'id' => $quoted->id,
            'body' => $quoted->body,
            'attachment_url' => $quoted->attachment_url,
            'removed_at' => $quoted->removed_at,
            'user' => ['id' => $quoted->user->id, 'name' => $quoted->user->name],
        ];
    }
}
