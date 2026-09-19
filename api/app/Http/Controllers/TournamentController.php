<?php

namespace App\Http\Controllers;

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
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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
    // one row per match (both sides side by side, same as the bracket view
    // itself), with each side's individual MatchPlayerStat rows folded into
    // a readable "Name: key=value, key=value" string per
    // PlayerStatFieldSets' labels. A team match's whole roster performance
    // stays on one row instead of exploding the CSV into one row per
    // player — exportPlayerRankings() below is the per-player view.
    public function exportResults(Tournament $tournament): StreamedResponse
    {
        $this->authorize('export', $tournament);

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

        $fieldLabels = collect(PlayerStatFieldSets::for($tournament->sport->name) ?? [])->pluck('label', 'key');

        $statsByMatch = MatchPlayerStat::whereIn('match_id', $matches->pluck('id'))
            ->with('user:id,name')
            ->get()
            ->groupBy('match_id');

        $describe = fn (array $stats) => collect($stats)
            ->map(fn ($value, $key) => ($fieldLabels[$key] ?? $key).'='.$value)
            ->implode(', ');

        $rows = $matches->map(function ($match) use ($statsByMatch, $describe) {
            $matchStats = $statsByMatch->get($match->id, collect());

            if ($match->participant_a_team_id) {
                $nameA = $match->participantATeam?->name;
                $statsA = $matchStats->where('team_id', $match->participant_a_team_id)
                    ->map(fn ($s) => ($s->user?->name ?? 'Player').': '.$describe($s->stats ?? []))
                    ->implode(' | ');
            } else {
                $nameA = $match->participantA?->name;
                $statA = $matchStats->firstWhere('user_id', $match->participant_a_id);
                $statsA = $statA ? $describe($statA->stats ?? []) : '';
            }

            if ($match->participant_b_team_id) {
                $nameB = $match->participantBTeam?->name;
                $statsB = $matchStats->where('team_id', $match->participant_b_team_id)
                    ->map(fn ($s) => ($s->user?->name ?? 'Player').': '.$describe($s->stats ?? []))
                    ->implode(' | ');
            } else {
                $nameB = $match->participantB?->name;
                $statB = $matchStats->firstWhere('user_id', $match->participant_b_id);
                $statsB = $statB ? $describe($statB->stats ?? []) : '';
            }

            return [
                $match->round,
                $match->bracket_type ?: 'main',
                $match->group_number !== null ? $match->group_number + 1 : '',
                $match->status,
                $match->scheduled_at?->toIso8601String(),
                $match->court?->name,
                $nameA,
                $match->score_a,
                $nameB,
                $match->score_b,
                $match->won_by_default ? 'Yes' : 'No',
                $match->winner_team_id ? $match->winnerTeam?->name : $match->winner?->name,
                $statsA,
                $statsB,
            ];
        });

        $filename = 'tournament-'.$tournament->id.'-full-results-'.now()->format('Y-m-d').'.csv';

        return CsvExport::download($filename, [
            'Round', 'Bracket', 'Group', 'Status', 'Scheduled At', 'Court',
            'Side A', 'Score A', 'Side B', 'Score B', 'Won By Default', 'Winner',
            'Side A Player Stats', 'Side B Player Stats',
        ], $rows);
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
