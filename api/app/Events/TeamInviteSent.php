<?php

namespace App\Events;

use App\Models\TeamMember;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class TeamInviteSent implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public TeamMember $teamMember) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('App.Models.User.'.$this->teamMember->user_id)];
    }

    public function broadcastAs(): string
    {
        return 'TeamInviteSent';
    }

    public function broadcastWith(): array
    {
        $team = $this->teamMember->team;

        return [
            'id' => $this->teamMember->id,
            'team' => [
                'id' => $team->id,
                'name' => $team->name,
                'sport' => $team->sport->name,
                'format' => $team->sportFormat->name,
            ],
            'captain' => [
                'id' => $team->captain->id,
                'name' => $team->captain->name,
            ],
        ];
    }
}
