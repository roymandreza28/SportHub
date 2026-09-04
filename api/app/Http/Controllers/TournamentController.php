<?php

namespace App\Http\Controllers;

use App\Models\Sport;
use App\Models\SportFormat;
use App\Models\Tournament;
use App\Models\User;
use App\Services\BracketService;
use App\Services\NotificationService;
use App\Support\NewsMediaStorage;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class TournamentController extends Controller
{
    public function index(Request $request, BracketService $bracketService)
    {
        $bracketService->autoStartExpired();

        return Tournament::query()
            ->with('sport:id,name', 'venue:id,name', 'sportFormat:id,name,players_per_side')
            ->when($request->string('status')->toString(), fn ($q, $status) => $q->where('status', $status))
            ->when($request->integer('sport_id') ?: null, fn ($q, $sportId) => $q->where('sport_id', $sportId))
            ->orderByDesc('starts_at')
            ->get();
    }

    public function show(Tournament $tournament)
    {
        return $tournament->load(
            'sport:id,name', 'venue:id,name', 'organizer:id,name',
            'venueOrganizer:id,name', 'livestreamOrganizer:id,name', 'sportFormat:id,name,players_per_side',
            'champion:id,name', 'championTeam:id,name'
        );
    }

    // A main organizer can assign one venue organizer (scoreboard) and one
    // livestream organizer (camera feed) per tournament — MatchPolicy and
    // LivestreamPolicy scope those roles' access to exactly this tournament.
    public function availableOrganizers()
    {
        return [
            'venue_organizers' => User::role('venue_organizer')->select('id', 'name', 'email')->orderBy('name')->get(),
            'livestream_organizers' => User::role('livestream_organizer')->select('id', 'name', 'email')->orderBy('name')->get(),
        ];
    }

    public function store(Request $request)
    {
        $this->authorize('create', Tournament::class);

        $data = $request->validate([
            'sport_id' => ['required', 'exists:sports,id'],
            'sport_format_id' => ['nullable', 'exists:sport_formats,id'],
            'name' => ['required', 'string', 'max:255'],
            'format' => ['required', 'in:single_elimination,double_elimination,round_robin,group_stage,swiss'],
            'starts_at' => ['required', 'date'],
            'ends_at' => ['nullable', 'date', 'after:starts_at'],
            'venue_id' => ['nullable', 'exists:venues,id'],
            // Required at creation — every tournament must have a venue
            // organizer designated up front, since match scoring is their
            // exclusive responsibility (the main organizer who creates the
            // tournament never scores it themselves; see MatchPolicy).
            'venue_organizer_id' => ['required', 'exists:users,id', $this->hasRoleRule('venue_organizer')],
            'livestream_organizer_id' => ['required', 'exists:users,id', $this->hasRoleRule('livestream_organizer')],
            'scoring_type' => ['sometimes', 'in:single_score,best_of_sets'],
            'sets_to_win' => ['required_if:scoring_type,best_of_sets', 'nullable', 'integer', 'min:2', 'max:4'],
            // Optional linked newsfeed announcement — mirrors NewsController::store()'s
            // own post-shape validation so the tournament wizard can double as a post
            // composer. Stays unpublished (published_at null) until the tournament
            // actually opens for registration; see update() below.
            'post_title' => ['nullable', 'required_with:post_body', 'string', 'max:255'],
            'post_body' => ['nullable', 'required_with:post_title', 'string'],
            'post_media' => ['nullable', 'array', 'max:6'],
            'post_media.*' => [
                'file',
                'mimetypes:image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime',
                'max:15360',
            ],
        ]);

        $this->validateSportFormat($data);

        $tournament = DB::transaction(function () use ($request, $data) {
            $tournament = $request->user()->organizedTournaments()->create([
                ...collect($data)->except(['post_title', 'post_body', 'post_media'])->all(),
                'status' => 'draft',
            ]);

            if (! empty($data['post_title'])) {
                $news = $tournament->news()->create([
                    'author_id' => $request->user()->id,
                    'tournament_id' => $tournament->id,
                    'title' => $data['post_title'],
                    'body' => $data['post_body'],
                    'published_at' => null,
                ]);

                NewsMediaStorage::store($news, $request->file('post_media', []));
            }

            return $tournament;
        });

        $this->notifyAssignment($tournament, 'venue_organizer_id', $tournament->venue_organizer_id);
        $this->notifyAssignment($tournament, 'livestream_organizer_id', $tournament->livestream_organizer_id);

        return response()->json(
            $tournament->load(
                'sport:id,name', 'venue:id,name', 'venueOrganizer:id,name',
                'livestreamOrganizer:id,name', 'sportFormat:id,name,players_per_side'
            ),
            201
        );
    }

    // Fires only for the user actually landing the assignment — both at
    // creation (required fields, so always fires there) and when update()
    // hands the role to someone new. Re-saving the same assignee (or an
    // update that doesn't touch these fields at all) intentionally stays
    // silent so accepting/re-editing a tournament doesn't re-notify.
    private function notifyAssignment(Tournament $tournament, string $field, ?int $newUserId): void
    {
        if (! $newUserId) {
            return;
        }

        NotificationService::send($newUserId, 'tournament_assigned', [
            'tournament_id' => $tournament->id,
            'tournament_name' => $tournament->name,
            'role' => $field === 'venue_organizer_id' ? 'venue_organizer' : 'livestream_organizer',
        ]);
    }

    // A sport flagged category='team' (Basketball, Volleyball) can only ever
    // be played as a team tournament — there's no meaningful "individual"
    // 5v5 game. Every other sport keeps today's optional-team behavior.
    private function validateSportFormat(array $data): void
    {
        $sport = Sport::find($data['sport_id']);

        if ($sport && $sport->category === 'team' && ! isset($data['sport_format_id'])) {
            throw ValidationException::withMessages([
                'sport_format_id' => ['This sport requires a team format — individual tournaments are not allowed.'],
            ]);
        }

        if (! isset($data['sport_format_id'])) {
            return;
        }

        $format = SportFormat::find($data['sport_format_id']);

        if (! $format || $format->sport_id !== (int) $data['sport_id']) {
            throw ValidationException::withMessages([
                'sport_format_id' => ['This format does not belong to the selected sport.'],
            ]);
        }

        if ($format->players_per_side <= 1) {
            throw ValidationException::withMessages([
                'sport_format_id' => ['This format does not require a team.'],
            ]);
        }
    }

    public function update(Request $request, Tournament $tournament)
    {
        $this->authorize('update', $tournament);

        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'starts_at' => ['sometimes', 'date'],
            'ends_at' => ['nullable', 'date', 'after:starts_at'],
            'venue_id' => ['nullable', 'exists:venues,id'],
            // Every other transition now has its own dedicated endpoint
            // (proceed()/cancel(), and preparation is set automatically by
            // BracketService) — a raw PATCH can only ever open registration,
            // so it can't be used to skip steps like jumping straight to
            // 'ongoing' without a bracket.
            'status' => ['sometimes', 'in:registration'],
            'venue_organizer_id' => ['nullable', 'exists:users,id', $this->hasRoleRule('venue_organizer')],
            'livestream_organizer_id' => ['nullable', 'exists:users,id', $this->hasRoleRule('livestream_organizer')],
        ]);

        $previousVenueOrganizerId = $tournament->venue_organizer_id;
        $previousLivestreamOrganizerId = $tournament->livestream_organizer_id;

        $tournament->update($data);

        if (array_key_exists('venue_organizer_id', $data) && $data['venue_organizer_id'] !== $previousVenueOrganizerId) {
            $this->notifyAssignment($tournament, 'venue_organizer_id', $data['venue_organizer_id']);
        }
        if (array_key_exists('livestream_organizer_id', $data) && $data['livestream_organizer_id'] !== $previousLivestreamOrganizerId) {
            $this->notifyAssignment($tournament, 'livestream_organizer_id', $data['livestream_organizer_id']);
        }

        if (($data['status'] ?? null) === 'registration') {
            $tournament->news()->whereNull('published_at')->update(['published_at' => now()]);
        }

        return $tournament;
    }

    private function hasRoleRule(string $role): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail) use ($role) {
            if ($value && ! User::find($value)?->hasRole($role)) {
                $fail("The selected {$attribute} is not a {$role}.");
            }
        };
    }

    public function generateBracket(Tournament $tournament, BracketService $bracketService)
    {
        $this->authorize('generateBracket', $tournament);

        if ($tournament->bracket) {
            abort(422, 'This tournament already has a bracket.');
        }

        $registeredCount = $tournament->registrations()->whereIn('status', ['pending', 'confirmed'])->count();

        if ($registeredCount < 2) {
            abort(422, 'This tournament needs at least 2 registrants before a bracket can be generated.');
        }

        $bracket = $bracketService->generate($tournament);

        $tournament->update(['status' => 'preparation']);

        return response()->json($bracket, 201);
    }

    // The organizer's real "not enough participants" wall — registration is
    // already closed by the time a tournament reaches 'preparation', so the
    // only path forward if a bracket never got generated is cancel(), not
    // proceed().
    public function proceed(Tournament $tournament, BracketService $bracketService)
    {
        $this->authorize('update', $tournament);

        if ($tournament->status !== 'preparation') {
            abort(422, 'Only a tournament in preparation can proceed.');
        }

        if (! $tournament->bracket) {
            abort(422, 'This tournament has no bracket to proceed with.');
        }

        $tournament->update(['status' => 'ongoing']);

        $bracketService->notifyParticipants($tournament, "{$tournament->name} has begun!");

        return $tournament;
    }

    public function cancel(Tournament $tournament, BracketService $bracketService)
    {
        $this->authorize('update', $tournament);

        if (! in_array($tournament->status, ['registration', 'preparation'], true)) {
            abort(422, 'Only a tournament in registration or preparation can be cancelled.');
        }

        $tournament->update(['status' => 'cancelled']);

        $bracketService->notifyParticipants($tournament, "{$tournament->name} has been cancelled.");

        return $tournament;
    }

    public function bracket(Tournament $tournament, BracketService $bracketService)
    {
        if (! $tournament->bracket) {
            $bracketService->autoStartExpired();
            $tournament->refresh();
        }

        $bracket = $tournament->bracket;

        if (! $bracket) {
            return response()->json(['message' => 'No bracket generated yet.'], 404);
        }

        $bracket->load(
            'matches.participantA:id,name', 'matches.participantB:id,name', 'matches.winner:id,name',
            'matches.participantATeam:id,name', 'matches.participantBTeam:id,name', 'matches.winnerTeam:id,name',
            'matches.court:id,venue_id,name', 'matches.court.venue:id,name'
        );

        // The frontend's portrait/"pyramid upward" bracket layout only makes
        // sense for single_elimination — it's the one format that's a
        // single clean tree narrowing to one final. Everything else
        // (double_elimination's two trees, round_robin/swiss's flat
        // rounds, group_stage's pre-knockout group play) keeps the
        // existing left-to-right layout, so the frontend needs the format
        // to decide, not just the match structure.
        return [...$bracket->toArray(), 'format' => $tournament->format];
    }
}
