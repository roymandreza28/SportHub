<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class SystemMetricUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public string $metric, public int $value) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('admin.monitoring')];
    }

    public function broadcastAs(): string
    {
        return 'SystemMetricUpdated';
    }

    public function broadcastWith(): array
    {
        return ['metric' => $this->metric, 'value' => $this->value];
    }
}
