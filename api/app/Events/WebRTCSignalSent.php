<?php

namespace App\Events;

use App\Models\Livestream;
use App\Models\User;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class WebRTCSignalSent implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public Livestream $livestream,
        public User $sender,
        public int $targetUserId,
        public string $type,
        public array $data,
    ) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('App.Models.User.'.$this->targetUserId)];
    }

    public function broadcastAs(): string
    {
        return 'WebRTCSignal';
    }

    public function broadcastWith(): array
    {
        return [
            'livestream_id' => $this->livestream->id,
            'from_user_id' => $this->sender->id,
            'from_user_name' => $this->sender->name,
            'type' => $this->type,
            'data' => $this->data,
        ];
    }
}
