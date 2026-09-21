<?php

namespace App\Http\Controllers;

use App\Models\MatchEvent;
use App\Models\MatchPlayerStat;
use App\Models\Sport;
use App\Models\SportFormat;
use App\Models\Tournament;
use App\Models\User;
use App\Models\Venue;
use App\Services\BracketService;
use App\Services\NotificationService;
use App\Support\CsvExport;
use App\Support\NewsMediaStorage;
use App\Support\PlayerStatFieldSets;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

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
            // Null/omitted = open to any gender. Enforced at registration
            // time in TournamentRegistrationController::store()/storeTeam(),
            // not editable after creation (see update() below) to avoid
            // stranding already-registered players/teams under a changed
            // restriction.
            'required_gender' => ['nullable', Rule::in(['male', 'female'])],
            'name' => ['required', 'string', 'max:255'],
            'format' => ['required', 'in:single_elimination,double_elimination,round_robin,group_stage,swiss'],
            'starts_at' => ['required', 'date'],
            'ends_at' => ['nullable', 'date', 'after:starts_at'],
            // A venue_facilitator must hold their tournament at a venue they
            // themselves registered (see ownVenueRule()) — required for
            // them specifically, since the whole point of them creating a
            // tournament is to host it at their own place. The main
            // organizer role keeps today's behavior: no venue required at
            // all, any active venue if they do pick one.
            'venue_id' => [
                $request->user()->hasRole('venue_facilitator') ? 'required' : 'nullable',
                'exists:venues,id',
                $this->ownVenueRule($request->user()),
            ],
            // Optional for the main organizer role — leaving either (or
            // both) unset means the main organizer runs that job
            // themselves instead of delegating it (see MatchPolicy::
            // updateScore()'s fallback to organizer_id when no
            // venue_organizer is assigned, and LivestreamController::
            // store()'s organizer_id branch, which already worked this way
            // even before this changed). A venue_facilitator has no
            // separate staff to assign here at all — these two fields are
            // silently overridden to their own id below regardless of what
            // (if anything) the request supplies.
            'venue_organizer_id' => [
                'sometimes',
                'exists:users,id',
                $this->hasRoleRule('venue_organizer'),
            ],
            'livestream_organizer_id' => [
                'sometimes',
                'exists:users,id',
                $this->hasRoleRule('livestream_organizer'),
            ],
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

        // A venue facilitator fills the venue-organizer/livestream-
        // organizer jobs themselves rather than assigning someone else to
        // them — overridden here rather than trusted from the request, the
        // same "never trust the client for what the server already knows"
        // principle as everywhere else server-derived (e.g. MatchController
        // ::upsertPlayerStats()'s team_id).
        if ($request->user()->hasRole('venue_facilitator')) {
            $data['venue_organizer_id'] = $request->user()->id;
            $data['livestream_organizer_id'] = $request->user()->id;
        }

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
    // silent so accepting/re-editing a tournament doesn't re-notify. Also
    // silent when the assignee is the tournament's own creator — a venue
    // facilitator auto-assigned to their own tournament shouldn't get a
    // "you were assigned to a tournament" notification about themselves.
    private function notifyAssignment(Tournament $tournament, string $field, ?int $newUserId): void
    {
        if (! $newUserId || $newUserId === $tournament->organizer_id) {
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
            'venue_id' => ['nullable', 'exists:venues,id', $this->ownVenueRule($request->user())],
            // Every other transition now has its own dedicated endpoint
            // (proceed()/cancel(), and preparation is set automatically by
            // BracketService) — a raw PATCH can only ever open registration,
            // so it can't be used to skip steps like jumping straight to
            // 'ongoing' without a bracket.
            'status' => ['sometimes', 'in:registration'],
            'venue_organizer_id' => ['nullable', 'exists:users,id', $this->hasRoleRule('venue_organizer')],
            'livestream_organizer_id' => ['nullable', 'exists:users,id', $this->hasRoleRule('livestream_organizer')],
        ]);

        // A venue facilitator always fills these jobs themselves (see
        // store()'s own comment) — never something they can hand off to
        // someone else via an update either.
        if ($request->user()->hasRole('venue_facilitator')) {
            unset($data['venue_organizer_id'], $data['livestream_organizer_id']);
        }

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

    // The main organizer role can pick any active venue (or none) — this
    // restriction only ever bites a venue_facilitator, who can only ever
    // hold their tournament at a venue they themselves registered
    // (Venue::facilitator_id === their own id), the same ownership check
    // VenuePolicy already applies to every other venue-management action.
    private function ownVenueRule(User $user): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail) use ($user) {
            if ($value && $user->hasRole('venue_facilitator') && ! Venue::where('id', $value)->where('facilitator_id', $user->id)->exists()) {
                $fail('You can only hold a tournament at a venue you registered.');
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

    // Covers the "Generated/exported reports contain correct totals, dates,
    // labels, and filters" defense-checklist criterion for the event-
    // management module — a CSV of exactly who's registered, sourced live
    // from the same registrations table every other registration view
    // reads from (no separate report-only data path to drift out of sync).
    public function exportRegistrations(Tournament $tournament): StreamedResponse
    {
        $this->authorize('export', $tournament);

        $registrations = $tournament->registrations()
            ->with(['user:id,name,email', 'team:id,name', 'team.members.user:id,name,email', 'registeredBy:id,name'])
            ->orderBy('created_at')
            ->get();

        $rows = $registrations->map(function ($registration) {
            $isTeam = $registration->team_id !== null;

            return [
                $registration->id,
                $isTeam ? 'Team' : 'Individual',
                $isTeam ? $registration->team?->name : $registration->user?->name,
                $isTeam ? '' : $registration->user?->email,
                $isTeam
                    ? $registration->team?->members
                        ->map(fn ($member) => $member->user?->name.' <'.$member->user?->email.'>')
                        ->implode('; ')
                    : '',
                $registration->status,
                $registration->registeredBy?->name,
                $registration->created_at?->toIso8601String(),
            ];
        });

        $filename = 'tournament-'.$tournament->id.'-registrations-'.now()->format('Y-m-d').'.csv';

        return CsvExport::download($filename, [
            'Registration ID', 'Type', 'Name', 'Email', 'Team Roster', 'Status', 'Registered By', 'Registered At',
        ], $rows);
    }

    // The "complete bracketing result with full statistical detail" export —
    // a PDF report (not CSV, since this is meant to be read/printed, not
    // opened in a spreadsheet) covering every match grouped by round, each
    // with both sides' scores, a per-player stats table, and a chronological
    // point-by-point match log built from MatchEvent, followed by a full
    // player-rankings leaderboard (via the same computePlayerRankings() the
    // CSV rankings export below uses, so the two never drift apart).
    // DomPDF (pure PHP, no headless-Chrome/Node binary) is used specifically
    // because Render's free-tier deploy has repeatedly proven fragile with
    // anything requiring an extra system binary.
    public function exportResults(Tournament $tournament): Response
    {
        $this->authorize('export', $tournament);

        $tournament->load(['sport', 'venue', 'organizer', 'sportFormat', 'champion', 'championTeam']);

        $matches = $tournament->bracket
            ?->matches()
            ->with([
                'participantA:id,name', 'participantB:id,name',
                'participantATeam:id,name', 'participantBTeam:id,name',
                'winner:id,name', 'winnerTeam:id,name',
                'court:id,name',
            ])
            ->orderBy('round')
            ->orderBy('id')
            ->get() ?? collect();

        $fields = PlayerStatFieldSets::for($tournament->sport->name) ?? [];
        $fieldLabels = collect($fields)->pluck('label', 'key');

        $statsByMatch = MatchPlayerStat::whereIn('match_id', $matches->pluck('id'))
            ->with('user:id,name')
            ->get()
            ->groupBy('match_id');

        $eventsByMatch = MatchEvent::whereIn('match_id', $matches->pluck('id'))
            ->orderBy('created_at')
            ->get()
            ->groupBy('match_id');

        $roundLabel = function ($match) {
            if ($match->bracket_type === 'final') {
                return 'Grand Final';
            }
            if ($match->group_number !== null) {
                return 'Group '.($match->group_number + 1).' — Round '.$match->round;
            }
            if ($match->bracket_type && $match->bracket_type !== 'main') {
                return ucfirst($match->bracket_type).' Bracket — Round '.$match->round;
            }

            return 'Round '.$match->round;
        };

        $matchesByRound = $matches
            ->groupBy($roundLabel)
            ->map(fn ($roundMatches) => $roundMatches->map(
                fn ($match) => $this->describeMatchForReport($match, $statsByMatch, $eventsByMatch)
            ));

        // The visual bracket display — one builder per format, each
        // mirroring BracketView.tsx's own layout for that format as closely
        // as a static PDF can (see each builder's own comment for specifics):
        // single_elimination is one clean tree; double_elimination gets the
        // full picture (winners bracket, losers bracket, and the grand
        // final); swiss gets round columns sub-divided into record buckets
        // with lines tracing each player's previous match; round_robin gets
        // plain round columns with no connectors (round_robin has no
        // bracket to advance through — see BracketService::advanceWinner()'s
        // own comment); group_stage gets both a standings card per group
        // AND, once knockout play has started, the same tree treatment as
        // single_elimination (a group_stage knockout match is structurally
        // identical to one — see BracketView.tsx's own isTreeRound comment).
        $bracketTree = match (true) {
            $tournament->format === 'single_elimination' && $matches->whereNull('group_number')->isNotEmpty()
                => $this->buildEliminationTree($matches->whereNull('group_number')),
            $tournament->format === 'double_elimination' => $this->buildDoubleEliminationTree($matches),
            $tournament->format === 'swiss' => $this->buildSwissTree($matches),
            $tournament->format === 'round_robin' => $this->buildRoundRobinLayout($matches),
            $tournament->format === 'group_stage' && $matches->whereNull('group_number')->isNotEmpty()
                => $this->buildEliminationTree($matches->whereNull('group_number')),
            default => null,
        };

        $groupStandings = $tournament->format === 'group_stage'
            ? $this->computeGroupStandingsForReport($matches->whereNotNull('group_number'))
            : null;

        ['primaryKey' => $primaryKey, 'ranked' => $ranked] = $this->computePlayerRankings($tournament, $matches->pluck('id'));

        $rankings = $ranked->map(function ($entry) use ($primaryKey) {
            $primaryTotal = $primaryKey ? $entry['totals'][$primaryKey] : null;
            $gamesPlayed = $entry['games_played'];

            return [
                'player' => $entry['user']?->name ?? 'Unknown',
                'team' => $entry['team']?->name ?: 'Individual',
                'games' => $gamesPlayed,
                'primary_total' => $primaryTotal,
                'per_game' => $primaryTotal !== null && $gamesPlayed > 0 ? round($primaryTotal / $gamesPlayed, 2) : '—',
                'totals' => $entry['totals'],
            ];
        })->values()->all();

        $pdf = Pdf::loadView('pdf.tournament-report', [
            'tournament' => $tournament,
            'bracketTree' => $bracketTree,
            'groupStandings' => $groupStandings,
            'matchesByRound' => $matchesByRound,
            'fieldLabels' => $fieldLabels,
            'rankings' => $rankings,
            'primaryStatLabel' => $primaryKey ? ($fieldLabels[$primaryKey] ?? $primaryKey) : 'Primary Stat',
            // Landscape (not the rest of the report's natural portrait) —
            // a bracket tree needs real horizontal room for its round
            // columns, and there's no reliable way to mix page orientations
            // within one DomPDF document.
        ])->setPaper('a4', 'landscape');

        $filename = 'tournament-'.$tournament->id.'-full-report-'.now()->format('Y-m-d').'.pdf';

        return $pdf->download($filename);
    }

    // One match's worth of report data: both sides' names/scores, the
    // per-player stat rows recorded for it, and its chronological
    // point-by-point log (built from MatchEvent's 'point' events — the same
    // events MatchController writes on every score update, win-by-default,
    // and best-of-sets set change).
    private function describeMatchForReport($match, $statsByMatch, $eventsByMatch): array
    {
        [$nameA, $nameB] = $this->matchSideNames($match);

        $stats = $statsByMatch->get($match->id, collect())->map(function ($s) use ($match, $nameA, $nameB) {
            $side = $s->team_id
                ? ($s->team_id === $match->participant_a_team_id ? $nameA : $nameB)
                : ($s->user_id === $match->participant_a_id ? $nameA : $nameB);

            return ['player' => $s->user?->name ?? 'Player', 'side' => $side, 'values' => $s->stats ?? []];
        })->values()->all();

        $log = $eventsByMatch->get($match->id, collect())->map(function ($event) {
            $payload = $event->payload ?? [];
            $score = (array_key_exists('score_a', $payload) || array_key_exists('score_b', $payload))
                ? ($payload['score_a'] ?? '—').' - '.($payload['score_b'] ?? '—')
                : '—';

            $noteParts = [];
            if (! empty($payload['period_label'])) {
                $noteParts[] = $payload['period_label'];
            }
            if (isset($payload['clock_seconds_remaining'])) {
                $noteParts[] = gmdate('i:s', (int) $payload['clock_seconds_remaining']).' remaining';
            }
            if (! empty($payload['sets'])) {
                $noteParts[] = 'Sets: '.collect($payload['sets'])
                    ->map(fn ($set) => ($set['score_a'] ?? '?').'-'.($set['score_b'] ?? '?'))
                    ->implode(', ');
            }
            if (! empty($payload['won_by_default'])) {
                $noteParts[] = 'Won by default'.(isset($payload['winner_side']) ? ' ('.strtoupper($payload['winner_side']).')' : '');
            }

            return [
                'time' => $event->created_at?->format('g:i:s A'),
                'score' => $score,
                'note' => $noteParts ? implode(' · ', $noteParts) : '—',
            ];
        })->values()->all();

        return [
            'name_a' => $nameA ?: 'TBD',
            'name_b' => $nameB ?: 'TBD',
            'score_a' => $match->score_a,
            'score_b' => $match->score_b,
            'status' => ucfirst(str_replace('_', ' ', $match->status)),
            'court' => $match->court?->name,
            'scheduled_at' => $match->scheduled_at?->format('M j, Y g:i A'),
            'winner' => $match->winner_team_id ? $match->winnerTeam?->name : $match->winner?->name,
            'won_by_default' => (bool) $match->won_by_default,
            'stats' => $stats,
            'log' => $log,
        ];
    }

    // Both sides' display names for one match — a team match shows the
    // team's name, an individual match shows the participant's own name.
    // Shared by describeMatchForReport() and buildEliminationTree() so the
    // two never show a match under different names.
    private function matchSideNames($match): array
    {
        return [
            ($match->participant_a_team_id ? $match->participantATeam?->name : $match->participantA?->name) ?: 'TBD',
            ($match->participant_b_team_id ? $match->participantBTeam?->name : $match->participantB?->name) ?: 'TBD',
        ];
    }

    // 'a', 'b', or null (not yet decided) — whichever side the recorded
    // winner (team or individual) corresponds to, for bolding the winning
    // side in the bracket tree.
    private function matchWinnerSide($match): ?string
    {
        if ($match->participant_a_team_id || $match->participant_b_team_id) {
            return match ($match->winner_team_id) {
                null => null,
                $match->participant_a_team_id => 'a',
                default => 'b',
            };
        }

        return match ($match->winner_id) {
            null => null,
            $match->participant_a_id => 'a',
            default => 'b',
        };
    }

    // Both sides' raw ids (team id for a team match, participant id
    // otherwise) — used wherever a match needs to be tied to a PLAYER
    // identity rather than a display name (Swiss's per-player connector
    // tracing, a group's standings table).
    private function matchSideIds($match): array
    {
        return [
            $match->participant_a_team_id ?: $match->participant_a_id,
            $match->participant_b_team_id ?: $match->participant_b_id,
        ];
    }

    private function matchWinnerId($match): ?int
    {
        return $match->winner_team_id ?: $match->winner_id;
    }

    // Shared box geometry — see buildEliminationTree()'s own comment for
    // why these are pixel-positioned instead of table rowspans.
    private const BRACKET_ROW_HEIGHT = 56;

    private const BRACKET_BOX_WIDTH = 185;

    private const BRACKET_BOX_HEIGHT = 46;

    private const BRACKET_CONNECTOR_WIDTH = 40;

    private const BRACKET_LABEL_HEIGHT = 20;

    // One round's worth of boxes, evenly distributed (not merely stacked)
    // across $trackHeight — for a track whose round sizes are a clean
    // power-of-two halving (single_elimination, or double_elimination's
    // winners bracket), this is mathematically identical to centering each
    // box exactly between the two boxes that feed it; for an irregular
    // track (the losers bracket, whose round sizes don't halve cleanly —
    // see BracketService::losersBracketRoundSize()) it still spaces every
    // round out across the SAME shared height, the same "stretch every
    // round-column to the tallest one" effect BracketView.tsx gets for free
    // from its own `items-stretch` + `justify-around` flex layout.
    private function layoutBracketRound($roundMatches, float $x, float $trackHeight, float $yOffset): array
    {
        $count = $roundMatches->count();
        $slot = $count > 0 ? $trackHeight / $count : $trackHeight;
        $boxes = [];

        foreach ($roundMatches->values() as $i => $match) {
            $centerY = $slot * ($i + 0.5) + $yOffset;
            [$nameA, $nameB] = $this->matchSideNames($match);
            $decided = $match->status === 'completed' || $match->won_by_default;

            $boxes[] = [
                'match_id' => $match->id,
                'x' => $x,
                'top' => $centerY - self::BRACKET_BOX_HEIGHT / 2,
                'center_y' => $centerY,
                'name_a' => $nameA,
                'name_b' => $nameB,
                'score_a' => $decided ? $match->score_a : null,
                'score_b' => $decided ? $match->score_b : null,
                'winner_side' => $this->matchWinnerSide($match),
            ];
        }

        return $boxes;
    }

    // One SVG document (batched, not one <img> per line) containing every
    // connector as a 3-segment elbow path from a box's right edge into its
    // target's left edge — embedded as a base64 data-URI <img>, since
    // DomPDF has no reliable way to draw vector lines from inline `<svg>`
    // markup (verified empirically against this project's installed
    // dompdf/php-svg-lib: it only engages through <img>/background-image,
    // never inline <svg> in the HTML body — an <svg> written directly into
    // the page silently renders nothing). $edges are {from, to, dashed} —
    // 'from'/'to' are match ids, resolved here against $boxByMatchId.
    private function buildConnectorImage(array $edges, array $boxByMatchId, float $width, float $height): string
    {
        $paths = [];

        foreach ($edges as $edge) {
            $from = $boxByMatchId[$edge['from']] ?? null;
            $to = $boxByMatchId[$edge['to']] ?? null;
            if (! $from || ! $to) {
                continue;
            }

            $fromX = $from['x'] + self::BRACKET_BOX_WIDTH;
            $fromY = $from['center_y'];
            $toX = $to['x'];
            $toY = $to['center_y'];
            $midX = ($fromX + $toX) / 2;

            // Amber + dashed marks a LOSER dropping into the losers bracket
            // (mirrors BracketView.tsx's own dashed/amber treatment for the
            // same relationship) — every other connector is a winner
            // advancing, drawn solid teal.
            $color = $edge['dashed'] ? '#fbbf24' : '#5eead4';
            $dash = $edge['dashed'] ? ' stroke-dasharray="4 3"' : '';

            $paths[] = '<path d="M '.$fromX.' '.$fromY.' L '.$midX.' '.$fromY.' L '.$midX.' '.$toY.' L '.$toX.' '.$toY.'"'
                .' fill="none" stroke="'.$color.'" stroke-width="2"'.$dash.'/>';
        }

        $svg = '<svg xmlns="http://www.w3.org/2000/svg" width="'.$width.'" height="'.$height.'">'.implode('', $paths).'</svg>';

        return 'data:image/svg+xml;base64,'.base64_encode($svg);
    }

    private function eliminationRoundLabel(int $roundIndex, int $totalRounds): string
    {
        return match ($totalRounds - $roundIndex) {
            0 => 'Final',
            1 => 'Semifinal',
            2 => 'Quarterfinal',
            default => 'Round '.$roundIndex,
        };
    }

    // single_elimination's visual bracket tree: one clean track, left to
    // right, connected by BracketService::advanceWinner()'s own
    // round[i*2]/[i*2+1] -> round+1[i] adjacency.
    private function buildEliminationTree($matches): array
    {
        $columnWidth = self::BRACKET_BOX_WIDTH + self::BRACKET_CONNECTOR_WIDTH;

        $byRound = $matches->groupBy('round')->values();
        $totalRounds = $byRound->count();
        $trackHeight = max($byRound->first()?->count() ?? 0, 1) * self::BRACKET_ROW_HEIGHT;

        $labels = [];
        $boxes = [];
        $boxByMatchId = [];

        foreach ($byRound as $idx => $roundMatches) {
            $x = $idx * $columnWidth;
            $labels[] = ['x' => $x, 'y' => 0, 'width' => self::BRACKET_BOX_WIDTH, 'text' => $this->eliminationRoundLabel($idx + 1, $totalRounds)];

            foreach ($this->layoutBracketRound($roundMatches, $x, $trackHeight, self::BRACKET_LABEL_HEIGHT) as $box) {
                $boxes[] = $box;
                $boxByMatchId[$box['match_id']] = $box;
            }
        }

        $edges = [];
        foreach ($byRound as $idx => $roundMatches) {
            $nextRound = $byRound->get($idx + 1);
            if (! $nextRound) {
                continue;
            }
            foreach ($roundMatches->values() as $j => $match) {
                $target = $nextRound->values()->get(intdiv($j, 2));
                if ($target) {
                    $edges[] = ['from' => $match->id, 'to' => $target->id, 'dashed' => false];
                }
            }
        }

        $width = $totalRounds > 0 ? ($totalRounds - 1) * $columnWidth + self::BRACKET_BOX_WIDTH : 0;
        $height = $trackHeight + self::BRACKET_LABEL_HEIGHT;

        return [
            'width' => $width,
            'height' => $height,
            'box_width' => self::BRACKET_BOX_WIDTH,
            'box_height' => self::BRACKET_BOX_HEIGHT,
            'connector_image' => $this->buildConnectorImage($edges, $boxByMatchId, $width, $height),
            'labels' => $labels,
            'boxes' => $boxes,
        ];
    }

    // double_elimination's full picture: the winners bracket AND the
    // losers bracket (stacked, both left-aligned) plus the grand final off
    // to the right — the same three-part layout BracketView.tsx's own
    // isDoubleElimination branch renders. Returns null only if there's no
    // winners bracket at all (bracket generation failed partway through).
    private function buildDoubleEliminationTree($matches): ?array
    {
        $columnWidth = self::BRACKET_BOX_WIDTH + self::BRACKET_CONNECTOR_WIDTH;
        $trackTitleHeight = 16;
        $trackGap = 26;

        $wbByRound = $matches->where('bracket_type', 'winners')->groupBy('round')->sortKeys()->values();
        $lbByRound = $matches->where('bracket_type', 'losers')->groupBy('round')->sortKeys()->values();
        $finalMatch = $matches->first(fn ($m) => $m->bracket_type === 'final');

        if ($wbByRound->isEmpty()) {
            return null;
        }

        $labels = [];
        $boxes = [];
        $boxByMatchId = [];

        $wbTrackHeight = ($wbByRound->map->count()->max() ?? 1) * self::BRACKET_ROW_HEIGHT;
        $wbTotalRounds = $wbByRound->count();
        $wbTopY = $trackTitleHeight + self::BRACKET_LABEL_HEIGHT;
        $wbWidth = $wbTotalRounds > 0 ? ($wbTotalRounds - 1) * $columnWidth + self::BRACKET_BOX_WIDTH : 0;

        $labels[] = ['x' => 0, 'y' => 0, 'width' => $wbWidth, 'text' => 'Winners Bracket', 'color' => '#0d9488'];
        foreach ($wbByRound as $idx => $roundMatches) {
            $x = $idx * $columnWidth;
            $label = $idx === $wbTotalRounds - 1 ? 'WB Final' : $this->eliminationRoundLabel($idx + 1, $wbTotalRounds);
            $labels[] = ['x' => $x, 'y' => $trackTitleHeight, 'width' => self::BRACKET_BOX_WIDTH, 'text' => $label];

            foreach ($this->layoutBracketRound($roundMatches, $x, $wbTrackHeight, $wbTopY) as $box) {
                $boxes[] = $box;
                $boxByMatchId[$box['match_id']] = $box;
            }
        }

        $lbWidth = 0;
        $lbTrackHeight = 0;
        if ($lbByRound->isNotEmpty()) {
            $lbTrackHeight = ($lbByRound->map->count()->max() ?? 1) * self::BRACKET_ROW_HEIGHT;
            $lbTotalRounds = $lbByRound->count();
            $lbTrackY = $wbTopY + $wbTrackHeight + $trackGap;
            $lbTopY = $lbTrackY + $trackTitleHeight + self::BRACKET_LABEL_HEIGHT;
            $lbWidth = $lbTotalRounds > 0 ? ($lbTotalRounds - 1) * $columnWidth + self::BRACKET_BOX_WIDTH : 0;

            $labels[] = ['x' => 0, 'y' => $lbTrackY, 'width' => $lbWidth, 'text' => 'Losers Bracket', 'color' => '#b45309'];
            foreach ($lbByRound as $idx => $roundMatches) {
                $x = $idx * $columnWidth;
                $label = $idx === $lbTotalRounds - 1 ? 'LB Final' : 'LB Round '.($idx + 1);
                $labels[] = ['x' => $x, 'y' => $lbTrackY + $trackTitleHeight, 'width' => self::BRACKET_BOX_WIDTH, 'text' => $label];

                foreach ($this->layoutBracketRound($roundMatches, $x, $lbTrackHeight, $lbTopY) as $box) {
                    $boxes[] = $box;
                    $boxByMatchId[$box['match_id']] = $box;
                }
            }
        }

        $leftWidth = max($wbWidth, $lbWidth);
        $leftHeight = $wbTopY + $wbTrackHeight + ($lbByRound->isNotEmpty() ? $trackGap + $trackTitleHeight + self::BRACKET_LABEL_HEIGHT + $lbTrackHeight : 0);

        $totalWidth = $leftWidth;
        if ($finalMatch) {
            $finalX = $leftWidth + self::BRACKET_CONNECTOR_WIDTH;
            $centerY = $leftHeight / 2;
            [$nameA, $nameB] = $this->matchSideNames($finalMatch);
            $decided = $finalMatch->status === 'completed' || $finalMatch->won_by_default;

            $finalBox = [
                'match_id' => $finalMatch->id,
                'x' => $finalX,
                'top' => $centerY - self::BRACKET_BOX_HEIGHT / 2,
                'center_y' => $centerY,
                'name_a' => $nameA,
                'name_b' => $nameB,
                'score_a' => $decided ? $finalMatch->score_a : null,
                'score_b' => $decided ? $finalMatch->score_b : null,
                'winner_side' => $this->matchWinnerSide($finalMatch),
            ];
            $boxes[] = $finalBox;
            $boxByMatchId[$finalBox['match_id']] = $finalBox;
            $labels[] = [
                'x' => $finalX, 'y' => max($centerY - self::BRACKET_BOX_HEIGHT / 2 - self::BRACKET_LABEL_HEIGHT, 0),
                'width' => self::BRACKET_BOX_WIDTH, 'text' => 'Grand Final', 'color' => '#7e22ce',
            ];
            $totalWidth = $finalX + self::BRACKET_BOX_WIDTH;
        }

        $edges = $this->computeDoubleEliminationEdges($wbByRound, $lbByRound, $finalMatch);

        return [
            'width' => $totalWidth,
            'height' => $leftHeight,
            'box_width' => self::BRACKET_BOX_WIDTH,
            'box_height' => self::BRACKET_BOX_HEIGHT,
            'connector_image' => $this->buildConnectorImage($edges, $boxByMatchId, $totalWidth, $leftHeight),
            'labels' => $labels,
            'boxes' => $boxes,
        ];
    }

    // Direct port of BracketView.tsx's computeDoubleEliminationConnectors()
    // — same three rules, same order: (1) a winners-bracket round's winner
    // advances to the next WB round, or the grand final once there's no
    // next WB round; (2) a WB round's LOSER drops into the losers bracket —
    // round 1's two losers pair up directly at LB round 1, a later round's
    // single loser instead joins the "merge" LB round 100+2*(wbRound-1) at
    // its own bracket_position; (3) a losers-bracket round's winner feeds
    // the next LB round (odd->even at the same position, even->odd at
    // floor(position/2) — see BracketService::advanceDoubleEliminationLosers()),
    // or the grand final once there's no next LB round. Kept in lockstep
    // with the frontend on purpose: this is what makes the drawn lines
    // match what actually happens when a result is reported, not just a
    // visual approximation of one.
    private function computeDoubleEliminationEdges($wbRounds, $lbRounds, $finalMatch): array
    {
        $wbRounds = $wbRounds->values();
        $lbRounds = $lbRounds->values();
        $edges = [];

        foreach ($wbRounds as $i => $round) {
            $nextRound = $wbRounds->get($i + 1);
            if ($nextRound) {
                foreach ($round->values() as $j => $m) {
                    $target = $nextRound->values()->get(intdiv($j, 2));
                    if ($target) {
                        $edges[] = ['from' => $m->id, 'to' => $target->id, 'dashed' => false];
                    }
                }
            } elseif ($finalMatch) {
                foreach ($round as $m) {
                    $edges[] = ['from' => $m->id, 'to' => $finalMatch->id, 'dashed' => false];
                }
            }
        }

        foreach ($wbRounds as $i => $round) {
            $wbRoundNumber = $i + 1;
            if ($wbRoundNumber === 1) {
                $lbRound1 = $lbRounds->get(0);
                if (! $lbRound1) {
                    continue;
                }
                foreach ($round->values() as $j => $m) {
                    $target = $lbRound1->first(fn ($lm) => $lm->bracket_position === intdiv($j, 2));
                    if ($target) {
                        $edges[] = ['from' => $m->id, 'to' => $target->id, 'dashed' => true];
                    }
                }
            } else {
                $lbRound = $lbRounds->first(fn ($r) => $r->first() && $r->first()->round === 100 + 2 * ($wbRoundNumber - 1));
                if (! $lbRound) {
                    continue;
                }
                foreach ($round->values() as $j => $m) {
                    $target = $lbRound->first(fn ($lm) => $lm->bracket_position === $j);
                    if ($target) {
                        $edges[] = ['from' => $m->id, 'to' => $target->id, 'dashed' => true];
                    }
                }
            }
        }

        foreach ($lbRounds as $i => $round) {
            $lbRoundNumber = $i + 1;
            $isLast = $i === $lbRounds->count() - 1;
            if ($isLast) {
                if ($finalMatch) {
                    foreach ($round as $m) {
                        $edges[] = ['from' => $m->id, 'to' => $finalMatch->id, 'dashed' => false];
                    }
                }

                continue;
            }

            $nextRound = $lbRounds->get($i + 1);
            if (! $nextRound) {
                continue;
            }

            if ($lbRoundNumber % 2 === 1) {
                foreach ($round as $m) {
                    $target = $nextRound->first(fn ($lm) => $lm->bracket_position === $m->bracket_position);
                    if ($target) {
                        $edges[] = ['from' => $m->id, 'to' => $target->id, 'dashed' => false];
                    }
                }
            } else {
                foreach ($round as $m) {
                    $nextPos = intdiv($m->bracket_position ?? 0, 2);
                    $target = $nextRound->first(fn ($lm) => $lm->bracket_position === $nextPos);
                    if ($target) {
                        $edges[] = ['from' => $m->id, 'to' => $target->id, 'dashed' => false];
                    }
                }
            }
        }

        return $edges;
    }

    // round_robin's visual: plain round columns, no connectors at all —
    // round_robin has no bracket to advance through (a result only affects
    // a standings row, never routes anyone into a "next match" — see
    // BracketService::advanceWinner()'s own comment on this), so unlike
    // every other format's tree there is nothing here to draw a line
    // between. Reuses the exact same {width, height, box_width, box_height,
    // connector_image, labels, boxes} shape every other builder returns
    // (connector_image is just an empty SVG) so the Blade template's
    // bracket-wrap markup stays identical across every format.
    private function buildRoundRobinLayout($matches): ?array
    {
        $columnWidth = self::BRACKET_BOX_WIDTH + 30;

        $byRound = $matches->groupBy('round')->sortKeys()->values();
        if ($byRound->isEmpty()) {
            return null;
        }

        $labels = [];
        $boxes = [];
        $maxBottom = 0;

        foreach ($byRound as $idx => $roundMatches) {
            $x = $idx * $columnWidth;
            $labels[] = ['x' => $x, 'y' => 0, 'width' => self::BRACKET_BOX_WIDTH, 'text' => 'Round '.($idx + 1)];

            foreach ($roundMatches->values() as $i => $match) {
                $top = self::BRACKET_LABEL_HEIGHT + $i * self::BRACKET_ROW_HEIGHT;
                [$nameA, $nameB] = $this->matchSideNames($match);
                $decided = $match->status === 'completed' || $match->won_by_default;

                $boxes[] = [
                    'match_id' => $match->id,
                    'x' => $x,
                    'top' => $top,
                    'center_y' => $top + self::BRACKET_BOX_HEIGHT / 2,
                    'name_a' => $nameA,
                    'name_b' => $nameB,
                    'score_a' => $decided ? $match->score_a : null,
                    'score_b' => $decided ? $match->score_b : null,
                    'winner_side' => $this->matchWinnerSide($match),
                ];
                $maxBottom = max($maxBottom, $top + self::BRACKET_BOX_HEIGHT);
            }
        }

        $width = $byRound->count() > 0 ? ($byRound->count() - 1) * $columnWidth + self::BRACKET_BOX_WIDTH : 0;
        $height = $maxBottom + 10;

        return [
            'width' => $width,
            'height' => $height,
            'box_width' => self::BRACKET_BOX_WIDTH,
            'box_height' => self::BRACKET_BOX_HEIGHT,
            'connector_image' => $this->buildConnectorImage([], [], $width, $height),
            'labels' => $labels,
            'boxes' => $boxes,
        ];
    }

    // swiss's visual: one column per round, each sub-divided into labeled
    // "record" buckets (the record a player carried INTO that round — same
    // grouping BracketView.tsx's own computeSwissRecordBuckets() derives
    // from the match results already on hand), connected round-to-round by
    // a plain line tracing each PLAYER's previous match — not an
    // advancement rule the way every other format's connectors are (swiss
    // pairing can pair a player with anyone still fresh each round, so
    // there's no fixed topology to encode), a direct port of
    // computeSwissConnectors()'s own "this player's previous game was
    // here" re-derivation. A round-1 match has no previous round, so it's
    // simply unconnected, same as the web version.
    private function buildSwissTree($matches): ?array
    {
        $swissMatches = $matches->where('bracket_type', 'swiss');
        if ($swissMatches->isEmpty()) {
            return null;
        }

        $columnWidth = self::BRACKET_BOX_WIDTH + 34;
        $bucketHeaderHeight = 14;
        $bucketGap = 8;
        $matchGap = 8;

        $rounds = $swissMatches->pluck('round')->unique()->sort()->values();
        $record = []; // player/team id => ['wins' => int, 'losses' => int]
        // A plain closure with an explicit by-reference `use`, not a `fn`
        // arrow function — `fn` captures $record BY VALUE at the moment
        // this closure is created, so every call would keep reading the
        // empty array from before the loop even started, never the tallies
        // folded in after each round.
        $recordLabel = function ($id) use (&$record) {
            return ($record[$id]['wins'] ?? 0).'-'.($record[$id]['losses'] ?? 0);
        };

        $labels = [];
        $boxes = [];
        $boxByMatchId = [];
        $edges = [];
        $maxBottom = 0;
        $prevRoundMatches = null;

        foreach ($rounds as $roundIdx => $round) {
            $roundMatches = $swissMatches->where('round', $round)->sortBy('id')->values();
            $x = $roundIdx * $columnWidth;
            $labels[] = ['x' => $x, 'y' => 0, 'width' => self::BRACKET_BOX_WIDTH, 'text' => 'Round '.$round];

            // Same-record matches grouped together, most-wins bucket first
            // (mirrors the reference layout's top-to-bottom order).
            $byLabel = [];
            foreach ($roundMatches as $match) {
                [$idA] = $this->matchSideIds($match);
                $label = $idA !== null ? $recordLabel($idA) : 'TBD';
                $byLabel[$label][] = $match;
            }
            $bucketLabels = array_keys($byLabel);
            usort($bucketLabels, fn ($a, $b) => (int) strtok($b, '-') <=> (int) strtok($a, '-'));

            $y = self::BRACKET_LABEL_HEIGHT;
            foreach ($bucketLabels as $label) {
                $labels[] = [
                    'x' => $x, 'y' => $y, 'width' => self::BRACKET_BOX_WIDTH, 'text' => $label,
                    'color' => '#0d9488', 'bucket' => true,
                ];
                $y += $bucketHeaderHeight;

                foreach ($byLabel[$label] as $match) {
                    [$nameA, $nameB] = $this->matchSideNames($match);
                    $decided = $match->status === 'completed' || $match->won_by_default;

                    $box = [
                        'match_id' => $match->id,
                        'x' => $x,
                        'top' => $y,
                        'center_y' => $y + self::BRACKET_BOX_HEIGHT / 2,
                        'name_a' => $nameA,
                        'name_b' => $nameB,
                        'score_a' => $decided ? $match->score_a : null,
                        'score_b' => $decided ? $match->score_b : null,
                        'winner_side' => $this->matchWinnerSide($match),
                    ];
                    $boxes[] = $box;
                    $boxByMatchId[$box['match_id']] = $box;
                    $y += self::BRACKET_BOX_HEIGHT + $matchGap;
                }

                $y += $bucketGap;
            }
            $maxBottom = max($maxBottom, $y);

            if ($prevRoundMatches) {
                $lastMatchByParticipant = [];
                foreach ($prevRoundMatches as $pm) {
                    foreach ($this->matchSideIds($pm) as $pid) {
                        if ($pid) {
                            $lastMatchByParticipant[$pid] = $pm;
                        }
                    }
                }

                $seen = [];
                foreach ($roundMatches as $match) {
                    foreach ($this->matchSideIds($match) as $pid) {
                        if (! $pid || ! isset($lastMatchByParticipant[$pid])) {
                            continue;
                        }
                        $prevMatch = $lastMatchByParticipant[$pid];
                        $key = $prevMatch->id.'-'.$match->id;
                        if (isset($seen[$key])) {
                            continue;
                        }
                        $seen[$key] = true;
                        $edges[] = ['from' => $prevMatch->id, 'to' => $match->id, 'dashed' => false];
                    }
                }
            }

            // Fold this round's actual results into the running tally
            // before the NEXT round's bucket labels are computed.
            foreach ($roundMatches as $match) {
                if ($match->status !== 'completed') {
                    continue;
                }
                $winnerId = $this->matchWinnerId($match);
                foreach ($this->matchSideIds($match) as $pid) {
                    if (! $pid) {
                        continue;
                    }
                    $record[$pid] ??= ['wins' => 0, 'losses' => 0];
                    if ($winnerId === $pid) {
                        $record[$pid]['wins']++;
                    } elseif ($winnerId) {
                        $record[$pid]['losses']++;
                    }
                }
            }

            $prevRoundMatches = $roundMatches;
        }

        $width = $rounds->count() > 0 ? ($rounds->count() - 1) * $columnWidth + self::BRACKET_BOX_WIDTH : 0;
        $height = $maxBottom + 10;

        return [
            'width' => $width,
            'height' => $height,
            'box_width' => self::BRACKET_BOX_WIDTH,
            'box_height' => self::BRACKET_BOX_HEIGHT,
            'connector_image' => $this->buildConnectorImage($edges, $boxByMatchId, $width, $height),
            'labels' => $labels,
            'boxes' => $boxes,
        ];
    }

    // group_stage's standings cards — one per group, ranked by the exact
    // same rule BracketService::rankGroup() uses to decide who really
    // advances (wins, then score differential, then total scored — see its
    // own doc comment), so the highlighted "advancing" rows here are never
    // just a display approximation. $groupMatches is every match with a
    // group_number set, across every group.
    private function computeGroupStandingsForReport($groupMatches): array
    {
        // Mirrors BracketService::ADVANCE_PER_GROUP (private to that
        // class, so duplicated here rather than reflected out) — the
        // qualifier count group_stage's knockout draw actually seeds from
        // each group.
        $advancePerGroup = 2;

        return $groupMatches->groupBy('group_number')->sortKeys()->map(function ($matches, $groupNumber) use ($advancePerGroup) {
            $names = [];
            $stats = [];

            foreach ($matches as $match) {
                [$idA, $idB] = $this->matchSideIds($match);
                [$nameA, $nameB] = $this->matchSideNames($match);
                if ($idA) {
                    $names[$idA] = $nameA;
                }
                if ($idB) {
                    $names[$idB] = $nameB;
                }

                foreach ([[$idA, $match->score_a, $match->score_b], [$idB, $match->score_b, $match->score_a]] as [$id, $for, $against]) {
                    if (! $id) {
                        continue;
                    }
                    $stats[$id] ??= ['id' => $id, 'wins' => 0, 'for' => 0, 'against' => 0];
                    $stats[$id]['for'] += $for ?? 0;
                    $stats[$id]['against'] += $against ?? 0;
                }

                $winnerId = $this->matchWinnerId($match);
                if ($winnerId && isset($stats[$winnerId])) {
                    $stats[$winnerId]['wins']++;
                }
            }

            $ranked = collect($stats)->sort(fn ($a, $b) => $b['wins'] <=> $a['wins']
                ?: ($b['for'] - $b['against']) <=> ($a['for'] - $a['against'])
                ?: $b['for'] <=> $a['for']
            )->values();

            return [
                'label' => 'Group '.chr(65 + $groupNumber),
                'advance_count' => $advancePerGroup,
                'standings' => $ranked->map(fn ($s) => [
                    'name' => $names[$s['id']] ?? 'Unknown',
                    'wins' => $s['wins'],
                    'for' => $s['for'],
                    'against' => $s['against'],
                    'diff' => $s['for'] - $s['against'],
                ])->all(),
            ];
        })->values()->all();
    }

    // The "ranking" export — every player who recorded at least one stat
    // row in this tournament, ranked by the sport's primary stat (the first
    // axis in PlayerStatFieldSets — Points for Basketball, Kills for
    // Volleyball, Points Won for the racquet sports — the same "top
    // scorer" metric a real leaderboard would use). Ranks individual
    // PLAYERS directly even in a team-sport tournament — team_id is shown
    // for context only, never used to group the ranking, since the point
    // is finding the single best-performing player, not the best team.
    public function exportPlayerRankings(Tournament $tournament): StreamedResponse
    {
        $this->authorize('export', $tournament);

        $matchIds = $tournament->bracket?->matches()->pluck('id') ?? collect();
        ['fields' => $fields, 'primaryKey' => $primaryKey, 'ranked' => $ranked] = $this->computePlayerRankings($tournament, $matchIds);

        $fieldLabels = collect($fields)->pluck('label', 'key');

        $rows = $ranked->map(function ($entry, $index) use ($fields, $primaryKey, $fieldLabels) {
            $primaryTotal = $primaryKey ? $entry['totals'][$primaryKey] : null;
            $gamesPlayed = $entry['games_played'];

            $row = [
                $index + 1,
                $entry['user']?->name,
                $entry['team']?->name ?: 'Individual',
                $gamesPlayed,
                $primaryKey ? ($fieldLabels[$primaryKey] ?? $primaryKey) : '',
                $primaryTotal,
                $primaryTotal !== null && $gamesPlayed > 0 ? round($primaryTotal / $gamesPlayed, 2) : '',
            ];

            foreach ($fields as $field) {
                $row[] = $entry['totals'][$field['key']];
            }

            return $row;
        });

        $filename = 'tournament-'.$tournament->id.'-player-rankings-'.now()->format('Y-m-d').'.csv';

        $headers = ['Rank', 'Player', 'Team', 'Games Played', 'Ranked By', 'Ranking Total', 'Per Game'];
        foreach ($fields as $field) {
            $headers[] = $field['label'].' (Total)';
        }

        return CsvExport::download($filename, $headers, $rows);
    }

    // Shared player-ranking aggregation — used by both exportPlayerRankings()
    // above (CSV) and exportResults()'s PDF rankings section, so the two
    // never drift apart. $matchIds may be any collection/array of match IDs
    // to include (both callers pass every match in the tournament's
    // bracket). Returns individual PLAYERS ranked by the sport's primary
    // stat — never grouped by team, since the point is finding the
    // best-performing player, not the winning team.
    private function computePlayerRankings(Tournament $tournament, $matchIds): array
    {
        $fields = PlayerStatFieldSets::for($tournament->sport->name) ?? [];
        $primaryKey = $fields[0]['key'] ?? null;

        $stats = MatchPlayerStat::whereIn('match_id', $matchIds)
            ->with(['user:id,name', 'team:id,name'])
            ->get();

        $byPlayer = $stats->groupBy('user_id')->map(function ($rows) use ($fields) {
            $totals = array_fill_keys(array_column($fields, 'key'), 0);
            foreach ($rows as $row) {
                foreach ($row->stats ?? [] as $key => $value) {
                    if (array_key_exists($key, $totals)) {
                        $totals[$key] += (float) $value;
                    }
                }
            }

            return [
                'user' => $rows->first()->user,
                // A player who switched teams mid-tournament (the roster/
                // registration flow doesn't forbid it) shows whichever team
                // their most recent stat row was recorded under.
                'team' => $rows->sortByDesc('created_at')->first()->team,
                'games_played' => $rows->pluck('match_id')->unique()->count(),
                'totals' => $totals,
            ];
        });

        $ranked = $byPlayer
            ->sortByDesc(fn ($p) => $primaryKey ? $p['totals'][$primaryKey] : array_sum($p['totals']))
            ->values();

        return ['fields' => $fields, 'primaryKey' => $primaryKey, 'ranked' => $ranked];
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
