<?php

namespace App\Http\Controllers;

use App\Models\Conversation;
use App\Models\Team;
use App\Models\Tournament;
use App\Models\TournamentRegistration;
use App\Models\User;
use App\Services\NotificationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TournamentRegistrationController extends Controller
{
    public function mine(Request $request)
    {
        return TournamentRegistration::where('registered_by', $request->user()->id)
            ->with([
                'user:id,name,email',
                'team.members.user:id,name,email',
                'tournament' => fn ($q) => $q->with('sport', 'venue'),
            ])
            ->orderByDesc('created_at')
            ->get();
    }

    public function minePlayer(Request $request)
    {
        $userId = $request->user()->id;

        return TournamentRegistration::where('user_id', $userId)
            ->orWhereHas('team.members', fn ($q) => $q->where('user_id', $userId)->where('status', 'accepted'))
            ->with([
                'registeredBy:id,name',
                'team.members.user:id,name,email',
                'tournament' => fn ($q) => $q->with('sport', 'venue'),
            ])
            ->orderByDesc('created_at')
            ->get();
    }

    public function store(Request $request, Tournament $tournament)
    {
        $this->authorize('create', TournamentRegistration::class);

        abort_if(
            $request->user()->verification_status !== 'verified',
            403,
            "Your account is still under verification. You can't register a player for a tournament yet."
        );

        $data = $request->validate([
            'user_id' => ['required', 'exists:users,id'],
        ]);

        abort_if($tournament->sport_format_id !== null, 422, 'This tournament requires team registration.');

        if (! in_array($tournament->status, ['draft', 'registration'], true)) {
            throw ValidationException::withMessages(['tournament' => ['Registration is closed for this tournament.']]);
        }

        // A coach registers one entrant per tournament, full stop — never a
        // second player once they've already used their one slot here.
        $coachAlreadyRegistered = TournamentRegistration::where('tournament_id', $tournament->id)
            ->where('registered_by', $request->user()->id)
            ->exists();

        if ($coachAlreadyRegistered) {
            throw ValidationException::withMessages(['tournament' => ['You have already registered a player for this tournament.']]);
        }

        $alreadyRegistered = TournamentRegistration::where('tournament_id', $tournament->id)
            ->where('user_id', $data['user_id'])
            ->exists();

        if ($alreadyRegistered) {
            throw ValidationException::withMessages(['user_id' => ['Your player is already registered in this tournament.']]);
        }

        if ($tournament->required_gender) {
            $player = User::find($data['user_id']);
            if ($player->gender !== $tournament->required_gender) {
                throw ValidationException::withMessages([
                    'user_id' => ["This tournament is restricted to {$tournament->required_gender} players."],
                ]);
            }
        }

        $registration = TournamentRegistration::create([
            'tournament_id' => $tournament->id,
            'user_id' => $data['user_id'],
            'registered_by' => $request->user()->id,
            'status' => 'pending',
        ]);

        // Only notify when someone else did the registering (a coach
        // entering their player) — no need to tell a player they just
        // registered themselves.
        if ((int) $data['user_id'] !== $request->user()->id) {
            NotificationService::send($data['user_id'], 'tournament_update', [
                'tournament_id' => $tournament->id,
                'tournament_name' => $tournament->name,
                'message' => "You've been registered for {$tournament->name}.",
            ]);
        }

        $registration->setAttribute('payment_receipt', $this->paymentReceipt($tournament, $registration, $request->user()->id));

        return response()->json($registration->load('user:id,name,email', 'tournament:id,name'), 201);
    }

    public function storeTeam(Request $request, Tournament $tournament)
    {
        $this->authorize('create', TournamentRegistration::class);

        abort_if(
            $request->user()->verification_status !== 'verified',
            403,
            "Your account is still under verification. You can't register a team for a tournament yet."
        );

        $data = $request->validate([
            'team_id' => ['required', 'exists:teams,id'],
        ]);

        abort_if($tournament->sport_format_id === null, 422, 'This tournament does not use team registration.');

        if (! in_array($tournament->status, ['draft', 'registration'], true)) {
            throw ValidationException::withMessages(['tournament' => ['Registration is closed for this tournament.']]);
        }

        $team = Team::findOrFail($data['team_id']);

        abort_unless($team->captain_id === $request->user()->id, 403, 'Only the team captain can register it.');
        abort_if(
            $team->sport_format_id !== $tournament->sport_format_id,
            422,
            'This team\'s format does not match the tournament\'s required format.'
        );
        abort_if($team->status !== 'ready', 422, 'This team is not full yet.');

        if ($tournament->required_gender) {
            // whereNull too — SQL's != never matches a NULL row, so a
            // player with no gender set on their profile would otherwise
            // silently slip through a gender-restricted tournament instead
            // of being correctly treated as "doesn't match."
            $mismatchedMember = $team->members()
                ->where('status', 'accepted')
                ->whereHas('user', fn ($q) => $q->where('gender', '!=', $tournament->required_gender)->orWhereNull('gender'))
                ->with('user:id,name,gender')
                ->first();

            if ($mismatchedMember) {
                throw ValidationException::withMessages([
                    'team_id' => [
                        "This tournament is restricted to {$tournament->required_gender} players — {$mismatchedMember->user->name} isn't.",
                    ],
                ]);
            }
        }

        // A coach registers one entrant per tournament, full stop — never a
        // second team (even one they also captain) once they've already
        // used their one slot here.
        $coachAlreadyRegistered = TournamentRegistration::where('tournament_id', $tournament->id)
            ->where('registered_by', $request->user()->id)
            ->exists();

        if ($coachAlreadyRegistered) {
            throw ValidationException::withMessages(['tournament' => ['You have already registered a team for this tournament.']]);
        }

        $alreadyRegistered = TournamentRegistration::where('tournament_id', $tournament->id)
            ->where('team_id', $team->id)
            ->exists();

        if ($alreadyRegistered) {
            throw ValidationException::withMessages(['team_id' => ['This team is already registered for this tournament.']]);
        }

        // A player can't be pulled into two different rosters that both
        // show up at the same tournament — find the first name on this
        // team's roster that's already spoken for by some other
        // registration (whether that other registration is itself
        // individual or team-based) already sitting on this tournament.
        $rosterUserIds = $team->members()->where('status', 'accepted')->pluck('user_id');

        $existingRegistrations = TournamentRegistration::where('tournament_id', $tournament->id)
            ->with(['team.members' => fn ($q) => $q->where('status', 'accepted')])
            ->get();

        $alreadyRegisteredUserIds = $existingRegistrations->flatMap(
            fn (TournamentRegistration $reg) => $reg->user_id ? [$reg->user_id] : $reg->team->members->pluck('user_id')
        );

        $conflictingUserId = $rosterUserIds->first(fn ($id) => $alreadyRegisteredUserIds->contains($id));

        if ($conflictingUserId) {
            $conflictingName = User::find($conflictingUserId)?->name ?? 'A player';
            throw ValidationException::withMessages([
                'team_id' => ["A player on your team is already registered for this tournament: {$conflictingName}."],
            ]);
        }

        $registration = TournamentRegistration::create([
            'tournament_id' => $tournament->id,
            'team_id' => $team->id,
            'registered_by' => $request->user()->id,
            'status' => 'pending',
        ]);

        $team->load('members');
        foreach ($team->members->where('status', 'accepted') as $member) {
            NotificationService::send($member->user_id, 'tournament_update', [
                'tournament_id' => $tournament->id,
                'tournament_name' => $tournament->name,
                'message' => "Your team \"{$team->name}\" has been registered for {$tournament->name}.",
            ]);
        }

        $this->ensureTeamConversation($team);

        $registration->setAttribute('payment_receipt', $this->paymentReceipt($tournament, $registration, $request->user()->id));

        return response()->json($registration->load('team.members.user:id,name,email', 'tournament:id,name'), 201);
    }

    // The organizer/facilitator's manual bookkeeping action once a coach
    // has actually paid them (arranged off-platform, via the chat
    // ensureRegistrationConversation() opens below) — there's no payment
    // gateway here, so this is a human confirming what already happened,
    // same as approving a venue booking implies the down payment cleared.
    public function updatePayment(Request $request, Tournament $tournament, TournamentRegistration $registration)
    {
        abort_if($registration->tournament_id !== $tournament->id, 404);

        $this->authorize('update', $tournament);

        $data = $request->validate(['paid' => ['required', 'boolean']]);

        $registration->update(['paid_at' => $data['paid'] ? now() : null]);

        return [
            'id' => $registration->id,
            'paid' => $registration->paid_at !== null,
            'paid_at' => $registration->paid_at?->toIso8601String(),
        ];
    }

    // Only set when the tournament actually has a registration fee — a free
    // tournament has nothing for the coach to pay, so there's nothing to
    // show a receipt for. Mirrors VenueBookingService's "the down-payment
    // prompt keys off this — present only when the pair's chosen venue+time
    // actually got auto-reserved" rationale: the receipt card only appears
    // when there's a real payment to arrange, never for a $0 registration.
    private function paymentReceipt(Tournament $tournament, TournamentRegistration $registration, int $coachId): ?array
    {
        if ($tournament->registration_fee === null) {
            return null;
        }

        // select()'d to id/name/phone/qr_code_path rather than the full
        // model — qr_code_path (the raw storage path) has to be selected
        // alongside qr_code_url's own computed accessor, or the accessor
        // silently resolves to null on a partial-column model instance.
        $organizer = $tournament->organizer()->select('id', 'name', 'phone', 'qr_code_path')->first();

        // A coach can never actually BE a tournament's organizer today (the
        // 'manage tournaments' permission that creating one requires isn't
        // granted to the coach role) — kept as a defensive guard anyway,
        // same self-notify precaution used everywhere else in this codebase.
        if (! $organizer || $organizer->id === $coachId) {
            return null;
        }

        $conversation = $this->ensureRegistrationConversation($registration, $coachId, $organizer->id);

        return [
            'tournament_name' => $tournament->name,
            'registration_fee' => $tournament->registration_fee,
            'conversation_id' => $conversation->id,
            'organizer' => [
                'id' => $organizer->id,
                'name' => $organizer->name,
                'phone' => $organizer->phone,
                'qr_code_url' => $organizer->qr_code_url,
            ],
        ];
    }

    // Created directly (not through Social\ConversationController::store())
    // for the same reason as VenueBookingService::ensureBookingConversation()/
    // ensureTeamConversation() above — a coach and the tournament's
    // organizer aren't necessarily already friends. The unique
    // tournament_registration_id column on conversations makes this
    // idempotent, mirroring both of those.
    private function ensureRegistrationConversation(TournamentRegistration $registration, int $coachId, int $organizerId): Conversation
    {
        return DB::transaction(function () use ($registration, $coachId, $organizerId) {
            $conversation = Conversation::firstOrCreate(
                ['tournament_registration_id' => $registration->id],
                ['type' => 'direct', 'created_by' => $organizerId]
            );

            if ($conversation->wasRecentlyCreated) {
                $conversation->participants()->attach(collect([$coachId, $organizerId])->unique());
            }

            return $conversation;
        });
    }

    // Created directly (not through Social\ConversationController::store())
    // for the same reason as VenueRegistrationController::ensureBookingConversation() —
    // a coach and their roster of players aren't necessarily already friends.
    // The unique team_id column on conversations makes this idempotent, so
    // registering the same team for a second tournament won't create a
    // duplicate chat.
    private function ensureTeamConversation(Team $team): void
    {
        DB::transaction(function () use ($team) {
            $conversation = Conversation::firstOrCreate(
                ['team_id' => $team->id],
                ['type' => 'group', 'name' => $team->name, 'created_by' => $team->captain_id]
            );

            if ($conversation->wasRecentlyCreated) {
                $memberIds = $team->members()->where('status', 'accepted')->pluck('user_id');
                $conversation->participants()->attach($memberIds->push($team->captain_id)->unique());
            }
        });
    }
}
