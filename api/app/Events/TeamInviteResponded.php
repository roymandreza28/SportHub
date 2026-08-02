<?php

namespace App\Events;

use App\Models\TeamMember;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class TeamInviteResponded implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public TeamMember $teamMember) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel('App.Models.User.'.$this->teamMember->team->captain_id)];
    }

    public function broadcastAs(): string
    {
        return 'TeamInviteResponded';
    }

    public function broadcastWith(): array
    {
        return [
            'team_id' => $this->teamMember->team_id,
            'user' => [
                'id' => $this->teamMember->user->id,
                'name' => $this->teamMember->user->name,
            ],
            'status' => $this->teamMember->status,
            'team_status' => $this->teamMember->team->status,
        ];
    }
}
