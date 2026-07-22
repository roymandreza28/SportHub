<?php

namespace App\Events;

use App\Models\VenueRegistration;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class VenueRegistrationUpdated implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public VenueRegistration $registration) {}

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel('venue.'.$this->registration->venue_id.'.schedule'),
            new PrivateChannel('venue-registrations.user.'.$this->registration->user_id),
        ];
    }

    public function broadcastAs(): string
    {
        return 'VenueRegistrationUpdated';
    }

    public function broadcastWith(): array
    {
        return [
            'id' => $this->registration->id,
            'venue_id' => $this->registration->venue_id,
            'court_id' => $this->registration->court_id,
            'status' => $this->registration->status,
            'starts_at' => $this->registration->starts_at,
            'ends_at' => $this->registration->ends_at,
        ];
    }
}
