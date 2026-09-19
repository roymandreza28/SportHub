<?php

namespace App\Http\Controllers\Social;

use App\Events\ConversationMessageSent;
use App\Http\Controllers\Controller;
use App\Models\Conversation;
use App\Models\User;
use App\Services\BookingConversationCleanupService;
use App\Support\Broadcasting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ConversationController extends Controller
{
    private const ORGANIZER_FAMILY_ROLES = ['organizer', 'venue_organizer', 'livestream_organizer'];

    public function index(Request $request)
    {
        BookingConversationCleanupService::run();

        // Archived and hidden ("deleted for me") threads are both excluded
        // from the normal list by default — ?archived=1 flips to showing
        // ONLY the archived ones (their own separate view, same as
        // Messenger's Archived Chats list), which never includes a hidden
        // one either. There's no "show hidden" view at all — same as
        // Messenger, a deleted chat has no recovery UI; it just silently
        // reappears the next time someone sends a new message into it (see
        // ConversationMessageController::store()).
        $showArchived = $request->boolean('archived');

        return $request->user()->conversations()
            ->wherePivotNull('hidden_at')
            // Not .when(...)->wherePivotNull(...) — a when() callback
            // receives the plain underlying query builder, not the
            // BelongsToMany relation, so wherePivotNull() inside one
            // resolves through Eloquent's magic dynamic-where parser
            // instead of the real pivot-aware method, silently building a
            // nonsense `where "pivot_null" = 'archived_at'` clause. Plain
            // whereNull/whereNotNull against the fully-qualified pivot
            // column name works fine on that same raw builder.
            ->when(
                $showArchived,
                fn ($q) => $q->whereNotNull('conversation_participants.archived_at'),
                fn ($q) => $q->whereNull('conversation_participants.archived_at')
            )
            ->with([
                'participants:id,name,avatar_path,last_seen_at',
                'participants.roles:name',
                'messages' => fn ($q) => $q->latest()->limit(1),
                'messages.user:id,name',
            ])
            ->get()
            ->each(fn (Conversation $c) => $this->decorateConversation($c, $request->user()->id))
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

            return response()->json($this->loadParticipants($conversation, $user->id), 201);
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

        return response()->json($this->loadParticipants($conversation, $user->id), 201);
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

        return response()->json($this->loadParticipants($conversation, $user->id), 201);
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

        return response()->json($this->loadParticipants($conversation, $user->id), 201);
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

    // Mute/archive/hide/block are all per-VIEWER flags on the requester's
    // own conversation_participants row — never something that affects the
    // other participant's own view of the same conversation.
    public function mute(Request $request, Conversation $conversation)
    {
        $this->authorize('manageParticipation', $conversation);

        $data = $request->validate(['duration' => ['required', 'in:15m,1h,8h,24h,forever,off']]);

        // A single nullable timestamp column covers every duration,
        // including "until I turn it back on" — stored as a far-future
        // timestamp rather than needing a second boolean column. `off`
        // (unmute) just clears it.
        $mutedUntil = match ($data['duration']) {
            '15m' => now()->addMinutes(15),
            '1h' => now()->addHour(),
            '8h' => now()->addHours(8),
            '24h' => now()->addDay(),
            'forever' => now()->addYears(50),
            'off' => null,
        };

        $conversation->participants()->updateExistingPivot($request->user()->id, ['muted_until' => $mutedUntil]);

        return response()->json(['muted_until' => $mutedUntil?->toIso8601String()]);
    }

    public function archive(Request $request, Conversation $conversation)
    {
        $this->authorize('manageParticipation', $conversation);

        $data = $request->validate(['archived' => ['required', 'boolean']]);

        $conversation->participants()->updateExistingPivot($request->user()->id, [
            'archived_at' => $data['archived'] ? now() : null,
        ]);

        return response()->noContent();
    }

    // "Delete" in the UI — Messenger-style: clears the thread from the
    // requester's own list only, and (see ConversationMessageController::
    // store()'s own comment) reappears there the next time anyone sends a
    // new message into it, same as archiving does. Never touches the
    // conversation or the other participant's row.
    public function hide(Request $request, Conversation $conversation)
    {
        $this->authorize('manageParticipation', $conversation);

        $conversation->participants()->updateExistingPivot($request->user()->id, ['hidden_at' => now()]);

        return response()->noContent();
    }

    // Conversation-scoped, not account-wide — blocks further messages in
    // THIS thread only (checked from either side in ConversationMessageController::
    // store()), without touching the friendship/matchmaking system. Direct
    // conversations only; "block" has no obvious meaning against a whole
    // group.
    public function block(Request $request, Conversation $conversation)
    {
        $this->authorize('manageParticipation', $conversation);
        abort_unless($conversation->type === 'direct', 422, 'Only a direct conversation can be blocked.');

        $conversation->participants()->updateExistingPivot($request->user()->id, ['blocked_at' => now()]);

        return response()->noContent();
    }

    // No admin moderation inbox exists in this app yet — reusing the same
    // "Contact admin" thread contactAdmin() already creates/reuses is the
    // only place a report can actually reach a human today, rather than
    // writing to a table nobody has a screen to read from.
    public function report(Request $request, Conversation $conversation)
    {
        $this->authorize('manageParticipation', $conversation);

        $data = $request->validate(['reason' => ['required', 'string', 'max:1000']]);

        $user = $request->user();
        $admin = User::role('admin')->orderBy('id')->first();
        abort_unless($admin, 503, 'Support is not available right now.');
        abort_if($user->id === $admin->id, 422, 'You are the admin.');

        $adminThread = $this->directConversationWith($user, $admin);

        $otherParticipant = $conversation->participants()->where('users.id', '!=', $user->id)->first();
        $subject = $conversation->type === 'group'
            ? 'the group "'.($conversation->name ?: 'Unnamed group').'"'
            : ($otherParticipant?->name ?? 'a user');

        $message = $adminThread->messages()->create([
            'user_id' => $user->id,
            'body' => "\u{26A0} Reported conversation #{$conversation->id} with {$subject}:\n\n{$data['reason']}",
        ]);
        $message->load('user:id,name');

        Broadcasting::safely(fn () => ConversationMessageSent::dispatch($message));

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

        return $this->loadParticipants($conversation, $request->user()->id);
    }

    // The FAQ conversation's other participant is always whichever admin
    // account first_or_created it (see contactAdmin() below) — the frontend
    // uses this flag to mask their real name behind a generic "admin-name"
    // label and to switch between the email-style composer (no admin reply
    // yet) and the normal chat thread (see AdminSupportThread.tsx), without
    // exposing which specific admin staff member is handling the thread.
    private function loadParticipants(Conversation $conversation, int $viewerId): Conversation
    {
        $conversation->load(['participants:id,name,avatar_path,last_seen_at', 'participants.roles:name']);

        return $this->decorateConversation($conversation, $viewerId);
    }

    private function decorateConversation(Conversation $conversation, int $viewerId): Conversation
    {
        $conversation->participants->each(function (User $participant) {
            $participant->is_admin = $participant->roles->contains('name', 'admin');
            $participant->makeHidden('roles');
        });

        // True only when someone OTHER than the viewer set the block — the
        // viewer's own pivot.blocked_at (see ConversationSummary.pivot on
        // the frontend) already tells them when THEY blocked the other
        // side; this is the one piece "am I the one who got blocked"
        // needs that pivot row can never answer on its own, since sending
        // is silenced from BOTH directions once either side blocks (see
        // ConversationMessageController::store()).
        $conversation->blocked_by_other = DB::table('conversation_participants')
            ->where('conversation_id', $conversation->id)
            ->where('user_id', '!=', $viewerId)
            ->whereNotNull('blocked_at')
            ->exists();

        return $conversation;
    }
}
