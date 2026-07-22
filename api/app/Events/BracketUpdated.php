<?php

namespace App\Events;

use App\Models\Bracket;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class BracketUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public Bracket $bracket) {}

    public function broadcastOn(): array
    {
        return [new Channel('tournament.'.$this->bracket->tournament_id)];
    }

    public function broadcastAs(): string
    {
        return 'BracketUpdated';
    }

    public function broadcastWith(): array
    {
        return [
            'tournament_id' => $this->bracket->tournament_id,
            'structure' => $this->bracket->structure,
            'current_round' => $this->bracket->current_round,
        ];
    }
}
