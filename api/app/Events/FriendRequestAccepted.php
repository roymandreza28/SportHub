<?php

namespace App\Events;

use App\Models\Friendship;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class FriendRequestAccepted implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public Friendship $friendship) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('App.Models.User.'.$this->friendship->requester_id)];
    }

    public function broadcastAs(): string
    {
        return 'FriendRequestAccepted';
    }

    public function broadcastWith(): array
    {
        return [
            'id' => $this->friendship->id,
            'addressee' => [
                'id' => $this->friendship->addressee->id,
                'name' => $this->friendship->addressee->name,
            ],
        ];
    }
}
