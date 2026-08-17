<?php

namespace App\Http\Controllers;

use App\Events\TeamInviteResponded;
use App\Events\TeamInviteSent;
use App\Models\SportFormat;
use App\Models\Team;
use App\Models\TeamMember;
use App\Models\User;
use App\Services\NotificationService;
use App\Support\Broadcasting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TeamController extends Controller
{
    public function mine(Request $request)
    {
        $user = $request->user();

        $teams = Team::where('captain_id', $user->id)
            ->orWhereHas('members', fn ($q) => $q->where('user_id', $user->id))
            ->with(['sport', 'sportFormat', 'captain:id,name,email', 'members.user:id,name,email'])
            ->orderByDesc('created_at')
            ->get();

        return $teams->map(fn (Team $team) => [
            ...$team->toArray(),
            'is_captain' => $team->captain_id === $user->id,
        ]);
    }

    public function store(Request $request)
    {
        $this->authorize('create', Team::class);

        $data = $request->validate([
            'sport_id' => ['required', 'exists:sports,id'],
            'sport_format_id' => ['required', 'exists:sport_formats,id'],
            'name' => ['nullable', 'string', 'max:255'],
        ]);

        $format = SportFormat::findOrFail($data['sport_format_id']);
        abort_unless($format->sport_id === (int) $data['sport_id'], 422, 'That format does not belong to the selected sport.');
        abort_if($format->players_per_side <= 1, 422, 'This format does not require a team.');

        $user = $request->user();

        return DB::transaction(function () use ($data, $format, $user) {
            $team = Team::create([
                'sport_id' => $data['sport_id'],
                'sport_format_id' => $format->id,
                'captain_id' => $user->id,
                'name' => $data['name'] ?? "{$user->name}'s Team",
                'status' => 'forming',
            ]);

            // A coach isn't one of the playing athletes — they manage the
            // roster but never occupy one of its player_per_side slots, so
            // unlike a player forming their own squad, the creator doesn't
            // auto-join as a member here.
            if (! $user->hasRole('coach')) {
                $team->members()->create([
                    'user_id' => $user->id,
                    'status' => 'accepted',
                    'responded_at' => now(),
                ]);
            }

            $team->refreshReadyStatus();

            return response()->json($team->fresh(['sport', 'sportFormat', 'members.user:id,name,email']), 201);
        });
    }

    // Coach-only direct roster add: unlike invite() (friend-gated, requires
    // the invitee to accept), a coach can already register any player for a
    // tournament without their prior consent — this mirrors that same
    // authority for building a team roster.
    public function addMember(Request $request, Team $team)
    {
        $this->authorize('manage', $team);
        abort_unless($request->user()->hasRole('coach'), 403);

        $data = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
        ]);

        $player = User::findOrFail($data['user_id']);

        abort_unless($request->user()->isFriendsWith($player), 422, 'You can only add friends to the team.');
        abort_if($team->status === 'disbanded', 422, 'This team has been disbanded.');
        // No max here, unlike invite()'s matchmaking-team cap — a tournament
        // roster only needs to meet the format's minimum (players_per_side);
        // the coach can keep adding bench/substitute players past it.
        abort_if($team->members()->where('user_id', $data['user_id'])->exists(), 422, 'That player is already on the team.');

        $member = $team->members()->create([
            'user_id' => $data['user_id'],
            'status' => 'accepted',
            'responded_at' => now(),
        ]);

        $team->refreshReadyStatus();

        return response()->json($member->fresh(['user:id,name,email', 'team.sportFormat']), 201);
    }

    public function invite(Request $request, Team $team)
    {
        $this->authorize('manage', $team);

        $data = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
        ]);

        $user = $request->user();
        $invitee = User::findOrFail($data['user_id']);

        abort_if($invitee->id === $user->id, 422, 'You are already on your own team.');
        abort_unless($user->isFriendsWith($invitee), 422, 'You can only invite friends to your team.');
        abort_if($team->status === 'disbanded', 422, 'This team has been disbanded.');
        abort_if($team->acceptedMemberCount() >= $team->sportFormat->players_per_side, 422, 'This team is already full.');

        return DB::transaction(function () use ($team, $invitee) {
            $member = $team->members()->where('user_id', $invitee->id)->lockForUpdate()->first();

            if ($member) {
                abort_if($member->status === 'accepted', 422, 'That player is already on the team.');
                abort_if($member->status === 'invited', 422, 'That player has already been invited.');

                // status === 'declined' — resend.
                $member->update(['status' => 'invited', 'responded_at' => null]);
            } else {
                $member = $team->members()->create(['user_id' => $invitee->id, 'status' => 'invited']);
            }

            $member = $member->fresh(['team.sport', 'team.sportFormat', 'team.captain']);

            Broadcasting::safely(fn () => TeamInviteSent::dispatch($member));

            NotificationService::send($invitee, 'team_invite', [
                'team_member_id' => $member->id,
                'team_id' => $member->team->id,
                'team_name' => $member->team->name,
                'sport_name' => $member->team->sport->name,
                'captain_name' => $member->team->captain->name,
            ]);

            return response()->json($member, 201);
        });
    }

    public function accept(Request $request, TeamMember $teamMember)
    {
        $this->authorize('respond', $teamMember);

        $teamMember->update(['status' => 'accepted', 'responded_at' => now()]);
        $teamMember->team->refreshReadyStatus();

        Broadcasting::safely(fn () => TeamInviteResponded::dispatch($teamMember->fresh(['team', 'user'])));

        return $teamMember->fresh(['team.sport', 'team.sportFormat']);
    }

    public function decline(Request $request, TeamMember $teamMember)
    {
        $this->authorize('respond', $teamMember);

        $teamMember->update(['status' => 'declined', 'responded_at' => now()]);

        Broadcasting::safely(fn () => TeamInviteResponded::dispatch($teamMember->fresh(['team', 'user'])));

        return response()->noContent();
    }

    public function removeMember(Request $request, Team $team, TeamMember $teamMember)
    {
        $this->authorize('remove', $teamMember);

        abort_if($teamMember->user_id === $team->captain_id, 422, 'The captain cannot be removed — disband the team instead.');

        $teamMember->delete();
        $team->refreshReadyStatus();

        return response()->noContent();
    }

    public function destroy(Request $request, Team $team)
    {
        $this->authorize('delete', $team);

        abort_if(
            $team->matchmakingRequests()->whereIn('status', ['open', 'matched'])->exists(),
            422,
            'This team has an active matchmaking request — cancel it before disbanding.'
        );

        $team->delete();

        return response()->noContent();
    }
}
