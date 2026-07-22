<?php

namespace App\Events;

use App\Models\MatchEvent;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class MatchEventCreated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public MatchEvent $matchEvent) {}

    public function broadcastOn(): array
    {
        return [new Channel('match.'.$this->matchEvent->match_id)];
    }

    public function broadcastAs(): string
    {
        return 'MatchEventCreated';
    }

    public function broadcastWith(): array
    {
        return [
            'type' => $this->matchEvent->type,
            'payload' => $this->matchEvent->payload,
            'created_at' => $this->matchEvent->created_at,
        ];
    }
}
