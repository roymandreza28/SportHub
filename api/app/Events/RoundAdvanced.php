<?php

namespace App\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class RoundAdvanced implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public int $tournamentId, public int $round) {}

    public function broadcastOn(): array
    {
        return [new Channel('tournament.'.$this->tournamentId)];
    }

    public function broadcastAs(): string
    {
        return 'RoundAdvanced';
    }

    public function broadcastWith(): array
    {
        return [
            'tournament_id' => $this->tournamentId,
            'round' => $this->round,
        ];
    }
}
