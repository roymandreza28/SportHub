<?php

namespace App\Events;

use App\Models\MatchmakingRequest;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class MatchmakingPairFound implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public MatchmakingRequest $requestA, public MatchmakingRequest $requestB) {}

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('matchmaking.'.$this->requestA->user_id),
            new PrivateChannel('matchmaking.'.$this->requestB->user_id),
        ];
    }

    public function broadcastAs(): string
    {
        return 'MatchmakingPairFound';
    }

    public function broadcastWith(): array
    {
        return [
            'request_a' => ['id' => $this->requestA->id, 'user_id' => $this->requestA->user_id],
            'request_b' => ['id' => $this->requestB->id, 'user_id' => $this->requestB->user_id],
        ];
    }
}
