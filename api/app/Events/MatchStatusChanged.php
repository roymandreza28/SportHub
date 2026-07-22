<?php

namespace App\Events;

use App\Models\GameMatch;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class MatchStatusChanged implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public GameMatch $match) {}

    public function broadcastOn(): array
    {
        return [new Channel('match.'.$this->match->id)];
    }

    public function broadcastAs(): string
    {
        return 'MatchStatusChanged';
    }

    public function broadcastWith(): array
    {
        return [
            'id' => $this->match->id,
            'status' => $this->match->status,
            'score_a' => $this->match->score_a,
            'score_b' => $this->match->score_b,
            'winner_id' => $this->match->winner_id,
        ];
    }
}
