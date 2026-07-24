<?php

namespace App\Events;

use App\Models\Friendship;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class FriendRequestSent implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public Friendship $friendship) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('App.Models.User.'.$this->friendship->addressee_id)];
    }

    public function broadcastAs(): string
    {
        return 'FriendRequestSent';
    }

    public function broadcastWith(): array
    {
        return [
            'id' => $this->friendship->id,
            'requester' => [
                'id' => $this->friendship->requester->id,
                'name' => $this->friendship->requester->name,
            ],
        ];
    }
}
