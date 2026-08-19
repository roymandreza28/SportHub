<?php

namespace App\Events;

use App\Models\Livestream;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

// Hop 2 of the livestream relay: the main organizer's browser re-broadcasts the
// feed it received from the livestream_organizer out to every newsfeed viewer.
// Those viewers may be fully anonymous (the public tabloid modal), so — unlike
// WebRTCSignalSent's private per-user channel — this rides a public channel and
// every subscriber filters by from_token/target_token client-side, the same
// "broadcast to everyone, filter locally" pattern already used for the public
// match/bracket update channels.
class PublicSignalRelayed implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public Livestream $livestream,
        public string $fromToken,
        public string $targetToken,
        public string $type,
        public array $data,
    ) {}

    public function broadcastOn(): array
    {
        return [new Channel('livestream.'.$this->livestream->id.'.public-signal')];
    }

    public function broadcastAs(): string
    {
        return 'PublicSignal';
    }

    public function broadcastWith(): array
    {
        return [
            'from_token' => $this->fromToken,
            'target_token' => $this->targetToken,
            'type' => $this->type,
            'data' => $this->data,
        ];
    }
}
