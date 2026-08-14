<?php

use App\Http\Controllers\Admin\AdminDashboardController;
use App\Http\Controllers\Admin\AdminUserController;
use App\Http\Controllers\Admin\AuditLogController;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\ChatMessageController;
use App\Http\Controllers\CourtController;
use App\Http\Controllers\EquipmentController;
use App\Http\Controllers\EvaluationController;
use App\Http\Controllers\LivestreamController;
use App\Http\Controllers\MatchController;
use App\Http\Controllers\MatchmakingRequestController;
use App\Http\Controllers\NewsCommentController;
use App\Http\Controllers\NewsController;
use App\Http\Controllers\NewsReactionController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\PlayerProfileController;
use App\Http\Controllers\SkillLevelController;
use App\Http\Controllers\Social\ConversationController;
use App\Http\Controllers\Social\ConversationMessageController;
use App\Http\Controllers\Social\FriendshipController;
use App\Http\Controllers\Social\PostController;
use App\Http\Controllers\Social\ProfileController;
use App\Http\Controllers\Social\SocialSearchController;
use App\Http\Controllers\TeamController;
use App\Http\Controllers\TournamentController;
use App\Http\Controllers\TournamentRegistrationController;
use App\Http\Controllers\VenueController;
use App\Http\Controllers\VenueRegistrationController;
use App\Models\Sport;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

Route::get('/sports', fn () => Sport::orderBy('name')->get());
Route::get('/sport-formats', function (Request $request) {
    return \App\Models\SportFormat::when($request->string('sport_id')->toString(), fn ($q, $sportId) => $q->where('sport_id', $sportId))
        ->orderBy('players_per_side')
        ->get();
});

// Must be registered before the public `/venues/{venue}` route below —
// otherwise Laravel matches "mine" as a {venue} route-model-binding
// parameter first and 404s before this ever runs.
Route::middleware(['auth:sanctum', 'role:venue_facilitator|admin'])->get('/venues/mine', [VenueController::class, 'mine']);

Route::get('/venues', [VenueController::class, 'index']);
Route::get('/venues/{venue}', [VenueController::class, 'show']);
Route::get('/venues/{venue}/availability', [VenueController::class, 'availability']);

Route::get('/tournaments', [TournamentController::class, 'index']);
Route::get('/tournaments/{tournament}', [TournamentController::class, 'show']);
Route::get('/tournaments/{tournament}/bracket', [TournamentController::class, 'bracket']);

Route::get('/news', [NewsController::class, 'index']);
Route::get('/news/{news}', [NewsController::class, 'show']);
Route::get('/news/{news}/comments', [NewsCommentController::class, 'index']);

Route::get('/livestreams', [LivestreamController::class, 'index']);
Route::get('/livestreams/{livestream}', [LivestreamController::class, 'show']);
Route::get('/livestreams/{livestream}/messages', [ChatMessageController::class, 'index']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::patch('/user/password', [AuthController::class, 'updatePassword']);
    Route::post('/user/avatar', [AuthController::class, 'updateAvatar']);

    Route::get('/user', function (Request $request) {
        $user = $request->user();

        return [
            ...$user->toArray(),
            'roles' => $user->getRoleNames()->values(),
        ];
    });

    Route::middleware('role:admin')->prefix('admin')->group(function () {
        Route::get('/users', [AdminUserController::class, 'index']);
        Route::patch('/users/{user}/roles', [AdminUserController::class, 'updateRoles']);
        Route::patch('/users/{user}/password', [AdminUserController::class, 'updatePassword']);
        Route::patch('/users/{user}/status', [AdminUserController::class, 'updateStatus']);
        Route::delete('/users/{user}', [AdminUserController::class, 'destroy']);
        Route::post('/facilitators', [AdminUserController::class, 'createFacilitator']);
        Route::get('/dashboard/metrics', [AdminDashboardController::class, 'metrics']);
        Route::get('/audit-log', [AuditLogController::class, 'index']);
    });

    Route::middleware('role:player|coach')->prefix('social')->group(function () {
        Route::get('/users', [SocialSearchController::class, 'index']);
        Route::get('/users/{user}', [ProfileController::class, 'show']);
        Route::post('/profile/cover', [ProfileController::class, 'updateCover']);

        Route::get('/friends', [FriendshipController::class, 'index']);
        Route::get('/friend-requests', [FriendshipController::class, 'pending']);
        Route::post('/friend-requests', [FriendshipController::class, 'store']);
        Route::post('/friend-requests/{friendship}/accept', [FriendshipController::class, 'accept']);
        Route::post('/friend-requests/{friendship}/decline', [FriendshipController::class, 'decline']);
        Route::delete('/friendships/{friendship}', [FriendshipController::class, 'destroy']);

        Route::get('/posts', [PostController::class, 'index']);
        Route::post('/posts', [PostController::class, 'store']);
        Route::delete('/posts/{post}', [PostController::class, 'destroy']);

        Route::post('/conversations', [ConversationController::class, 'store']);
        Route::post('/conversations/{conversation}/participants', [ConversationController::class, 'addParticipant']);
    });

    // A venue facilitator can't start or join a conversation on their own —
    // only view/read/send within one they were auto-attached to when a
    // booking at their venue got approved (see VenueRegistrationController)
    // — so this group is broader than the player|coach one above.
    Route::middleware('role:player|coach|venue_facilitator')->prefix('social')->group(function () {
        Route::get('/conversations', [ConversationController::class, 'index']);
        Route::post('/conversations/{conversation}/read', [ConversationController::class, 'markRead']);
        Route::get('/conversations/{conversation}/messages', [ConversationMessageController::class, 'index']);
        Route::post('/conversations/{conversation}/messages', [ConversationMessageController::class, 'store']);
    });

    Route::middleware('role:venue_facilitator|admin')->group(function () {
        Route::post('/venues', [VenueController::class, 'store']);
        Route::patch('/venues/{venue}', [VenueController::class, 'update']);
        Route::delete('/venues/{venue}', [VenueController::class, 'destroy']);
        Route::get('/venues/{venue}/schedule', [VenueController::class, 'schedule']);

        Route::post('/venues/{venue}/courts', [CourtController::class, 'store']);
        Route::patch('/courts/{court}', [CourtController::class, 'update']);
        Route::delete('/courts/{court}', [CourtController::class, 'destroy']);

        Route::post('/venues/{venue}/equipment', [EquipmentController::class, 'store']);
        Route::patch('/equipment/{equipment}', [EquipmentController::class, 'update']);
        Route::delete('/equipment/{equipment}', [EquipmentController::class, 'destroy']);

        Route::patch('/venue-registrations/{venueRegistration}', [VenueRegistrationController::class, 'update']);
    });

    Route::middleware('role:player|coach')->group(function () {
        Route::get('/venue-registrations/mine', [VenueRegistrationController::class, 'mine']);
        Route::post('/venue-registrations', [VenueRegistrationController::class, 'store']);

        // Read-only Newsfeed: player/coach can react, comment, and (via the
        // existing friend-messaging system on the frontend) share an
        // organizer's article, but never create/edit/delete one — that stays
        // gated behind the 'manage news' permission below, organizer-only.
        Route::post('/news/{news}/comments', [NewsCommentController::class, 'store']);
        Route::delete('/news-comments/{newsComment}', [NewsCommentController::class, 'destroy']);
        Route::post('/news/{news}/react', [NewsReactionController::class, 'toggle']);

        Route::get('/notifications', [NotificationController::class, 'index']);
        Route::post('/notifications/read-all', [NotificationController::class, 'markAllRead']);
        Route::post('/notifications/{notification}/read', [NotificationController::class, 'markRead']);
    });

    Route::middleware('role:player')->group(function () {
        Route::get('/player-profile', [PlayerProfileController::class, 'show']);
        Route::patch('/player-profile', [PlayerProfileController::class, 'update']);

        Route::get('/skill-levels/mine', [SkillLevelController::class, 'mine']);
    });

    // Matchmaking and the teams it depends on for multi-player formats are
    // open to coaches too, not just players.
    Route::middleware('role:player|coach')->group(function () {
        Route::get('/matchmaking-requests/mine', [MatchmakingRequestController::class, 'mine']);
        Route::post('/matchmaking-requests', [MatchmakingRequestController::class, 'store']);
        Route::delete('/matchmaking-requests/{matchmakingRequest}', [MatchmakingRequestController::class, 'destroy']);

        Route::get('/teams/mine', [TeamController::class, 'mine']);
        Route::post('/teams', [TeamController::class, 'store']);
        Route::post('/teams/{team}/invite', [TeamController::class, 'invite']);
        Route::delete('/teams/{team}', [TeamController::class, 'destroy']);
        Route::delete('/teams/{team}/members/{teamMember}', [TeamController::class, 'removeMember']);
        Route::post('/team-members/{teamMember}/accept', [TeamController::class, 'accept']);
        Route::post('/team-members/{teamMember}/decline', [TeamController::class, 'decline']);
    });

    Route::middleware('role:coach')->group(function () {
        Route::get('/players', function (Request $request) {
            $search = $request->string('search')->toString();

            return User::role('player')
                ->when($search, fn ($q, $s) => $q
                    ->where(fn ($q2) => $q2->where('name', 'ilike', "%{$s}%")->orWhere('email', 'ilike', "%{$s}%")))
                ->orderBy('name')
                ->limit(20)
                ->get(['id', 'name', 'email']);
        });

        Route::post('/tournaments/{tournament}/registrations', [TournamentRegistrationController::class, 'store']);

        Route::get('/evaluations', [EvaluationController::class, 'index']);
        Route::post('/evaluations', [EvaluationController::class, 'store']);
    });

    Route::middleware('role:organizer|admin')->group(function () {
        Route::post('/tournaments', [TournamentController::class, 'store']);
        Route::patch('/tournaments/{tournament}', [TournamentController::class, 'update']);
        Route::post('/tournaments/{tournament}/generate-bracket', [TournamentController::class, 'generateBracket']);

        Route::patch('/matches/{match}/score', [MatchController::class, 'updateScore']);

        Route::post('/news', [NewsController::class, 'store']);
        Route::patch('/news/{news}', [NewsController::class, 'update']);
        Route::delete('/news/{news}', [NewsController::class, 'destroy']);

        Route::post('/livestreams', [LivestreamController::class, 'store']);
        Route::patch('/livestreams/{livestream}', [LivestreamController::class, 'update']);
        Route::delete('/livestreams/{livestream}', [LivestreamController::class, 'destroy']);
    });

    Route::post('/livestreams/{livestream}/messages', [ChatMessageController::class, 'store']);
});
