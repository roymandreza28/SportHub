<?php

namespace App\Events;

use App\Models\GameMatch;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

// Fired only on a real clock transition (start, pause, period/overtime
// change, manual adjustment) — never once per tick — so a viewer's widget
// extrapolates the running countdown locally between syncs from
// clock_seconds_remaining + clock_synced_at, the same pattern the
// broadcaster's own live-video relay uses to avoid a message-per-second.
class MatchClockChanged implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public GameMatch $match) {}

    public function broadcastOn(): array
    {
        return [new Channel('match.'.$this->match->id)];
    }

    public function broadcastAs(): string
    {
        return 'MatchClockChanged';
    }

    public function broadcastWith(): array
    {
        return [
            'id' => $this->match->id,
            'clock_seconds_remaining' => $this->match->clock_seconds_remaining,
            'clock_shot_seconds_remaining' => $this->match->clock_shot_seconds_remaining,
            'clock_running' => $this->match->clock_running,
            'clock_period_label' => $this->match->clock_period_label,
            'clock_synced_at' => $this->match->clock_synced_at?->toIso8601String(),
        ];
    }
}
