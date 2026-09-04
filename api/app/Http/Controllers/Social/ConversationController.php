<?php

namespace App\Http\Controllers\Social;

use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\User;
use App\Services\BookingConversationCleanupService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ConversationController extends Controller
{
    private const ORGANIZER_FAMILY_ROLES = ['organizer', 'venue_organizer', 'livestream_organizer'];

    public function index(Request $request)
    {
        BookingConversationCleanupService::run();

        return $request->user()->conversations()
            ->with([
                'participants:id,name,avatar_path',
                'participants.roles:name',
                'messages' => fn ($q) => $q->latest()->limit(1),
                'messages.user:id,name',
            ])
            ->get()
            ->each(fn (Conversation $c) => $this->flagAdminParticipants($c))
            ->sortByDesc(fn (Conversation $c) => $c->messages->first()?->created_at ?? $c->created_at)
            ->values();
    }

    public function store(Request $request)
    {
        $this->authorize('create', Conversation::class);

        $data = $request->validate([
            'type' => ['required', 'in:direct,group'],
            'user_id' => ['required_if:type,direct', 'integer', 'exists:users,id'],
            'name' => ['required_if:type,group', 'string', 'max:255'],
            'participant_ids' => ['required_if:type,group', 'array', 'min:1'],
            'participant_ids.*' => ['integer', 'exists:users,id'],
        ]);

        $user = $request->user();
        $friendIds = $user->friends()->pluck('id');

        if ($data['type'] === 'direct') {
            $otherId = (int) $data['user_id'];

            abort_if($otherId === $user->id, 422, 'You cannot message yourself.');
            abort_unless($friendIds->contains($otherId), 422, 'You can only message friends.');

            $conversation = $this->directConversationWith($user, User::findOrFail($otherId));

            return response()->json($this->loadParticipants($conversation), 201);
        }

        $participantIds = collect($data['participant_ids'])->map(fn ($id) => (int) $id);
        $invalid = $participantIds->diff($friendIds);
        abort_if($invalid->isNotEmpty(), 422, 'You can only add friends to a group.');

        $conversation = Conversation::create([
            'type' => 'group',
            'name' => $data['name'],
            'created_by' => $user->id,
        ]);

        $conversation->participants()->attach($participantIds->push($user->id)->unique());

        return response()->json($this->loadParticipants($conversation), 201);
    }

    // The "FAQ" button in the settings dropdown for every role except admin
    // itself (player, coach, venue_facilitator, organizer, venue_organizer,
    // livestream_organizer) — support contact with an admin. Bypasses
    // store()'s friend-gate entirely (same rationale as
    // VenueRegistrationController::ensureBookingConversation()) since a user
    // reaching out for help has no reason to already be friends with an
    // admin, and most of these roles don't hold the 'use chat' permission
    // store() requires anyway. Keyed on direct_key like any other direct
    // conversation, so a second click reopens the same thread instead of
    // creating a new one.
    public function contactAdmin(Request $request)
    {
        $user = $request->user();
        $admin = User::role('admin')->orderBy('id')->first();
        abort_unless($admin, 503, 'Support is not available right now.');
        abort_if($user->id === $admin->id, 422, 'You are the admin.');

        $conversation = $this->directConversationWith($user, $admin);

        return response()->json($this->loadParticipants($conversation), 201);
    }

    // The organizer, venue_organizer, and livestream_organizer roles have no
    // friend list to pick a colleague from (only player/coach hold 'manage
    // friendships'), and coordinating across a tournament — the main
    // organizer reaching a venue/livestream organizer, or either of those
    // reaching the main organizer back — shouldn't require one first. Every
    // member of this "family" can see and message every other member,
    // regardless of whether they've actually been assigned together on a
    // specific tournament yet.
    public function organizerDirectory(Request $request)
    {
        return User::role(self::ORGANIZER_FAMILY_ROLES)
            ->where('id', '!=', $request->user()->id)
            ->with('roles:name')
            ->select('id', 'name', 'email', 'avatar_path')
            ->orderBy('name')
            ->get()
            ->map(fn (User $u) => [
                'id' => $u->id,
                'name' => $u->name,
                'email' => $u->email,
                'avatar_url' => $u->avatar_url,
                // A user only ever holds one of the three organizer-family
                // roles at a time in this app, so "first" is unambiguous.
                'role' => $u->roles->first()?->name,
            ]);
    }

    public function contactColleague(Request $request)
    {
        $data = $request->validate(['user_id' => ['required', 'integer', 'exists:users,id']]);
        $user = $request->user();
        $colleague = User::findOrFail($data['user_id']);

        abort_if($colleague->id === $user->id, 422, 'You cannot message yourself.');
        abort_unless(
            $colleague->hasAnyRole(self::ORGANIZER_FAMILY_ROLES),
            422,
            'That user is not part of the organizer team.'
        );

        $conversation = $this->directConversationWith($user, $colleague);

        return response()->json($this->loadParticipants($conversation), 201);
    }

    // Shared by store()'s direct branch, contactAdmin(), and
    // contactColleague() — every one of them ultimately just needs "the one
    // direct conversation between these two people," created if it doesn't
    // exist yet, with whatever bypasses the friend-gate handled by the
    // caller before this runs.
    private function directConversationWith(User $a, User $b): Conversation
    {
        return DB::transaction(function () use ($a, $b) {
            $conversation = Conversation::firstOrCreate(
                ['direct_key' => Conversation::directKeyFor($a->id, $b->id)],
                ['type' => 'direct', 'created_by' => $a->id]
            );

            if ($conversation->wasRecentlyCreated) {
                $conversation->participants()->attach([$a->id, $b->id]);
            }

            return $conversation;
        });
    }

    public function markRead(Request $request, Conversation $conversation)
    {
        $this->authorize('view', $conversation);

        $conversation->participants()->updateExistingPivot($request->user()->id, ['last_read_at' => now()]);

        return response()->noContent();
    }

    public function addParticipant(Request $request, Conversation $conversation)
    {
        $this->authorize('addParticipant', $conversation);

        $data = $request->validate([
            'user_id' => ['required', 'integer', 'exists:users,id'],
        ]);

        $newUserId = (int) $data['user_id'];
        abort_unless($request->user()->friends()->pluck('id')->contains($newUserId), 422, 'You can only add friends.');

        $conversation->participants()->syncWithoutDetaching([$newUserId]);

        return $this->loadParticipants($conversation);
    }

    // The FAQ conversation's other participant is always whichever admin
    // account first_or_created it (see contactAdmin() below) — the frontend
    // uses this flag to mask their real name behind a generic "admin-name"
    // label and to switch between the email-style composer (no admin reply
    // yet) and the normal chat thread (see AdminSupportThread.tsx), without
    // exposing which specific admin staff member is handling the thread.
    private function loadParticipants(Conversation $conversation): Conversation
    {
        $conversation->load(['participants:id,name,avatar_path', 'participants.roles:name']);

        return $this->flagAdminParticipants($conversation);
    }

    private function flagAdminParticipants(Conversation $conversation): Conversation
    {
        $conversation->participants->each(function (User $participant) {
            $participant->is_admin = $participant->roles->contains('name', 'admin');
            $participant->makeHidden('roles');
        });

        return $conversation;
    }
}
