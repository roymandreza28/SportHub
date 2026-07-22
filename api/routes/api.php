<?php

use App\Http\Controllers\Admin\AdminDashboardController;
use App\Http\Controllers\Admin\AdminUserController;
use App\Http\Controllers\Admin\AuditLogController;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\CourtController;
use App\Http\Controllers\EquipmentController;
use App\Http\Controllers\EvaluationController;
use App\Http\Controllers\MatchmakingRequestController;
use App\Http\Controllers\PlayerProfileController;
use App\Http\Controllers\SkillLevelController;
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

Route::get('/venues', [VenueController::class, 'index']);
Route::get('/venues/{venue}', [VenueController::class, 'show']);
Route::get('/venues/{venue}/availability', [VenueController::class, 'availability']);

Route::get('/tournaments', [TournamentController::class, 'index']);
Route::get('/tournaments/{tournament}', [TournamentController::class, 'show']);

Route::middleware('auth:sanctum')->group(function () {
    Route::post('/logout', [AuthController::class, 'logout']);

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
        Route::post('/facilitators', [AdminUserController::class, 'createFacilitator']);
        Route::get('/dashboard/metrics', [AdminDashboardController::class, 'metrics']);
        Route::get('/audit-log', [AuditLogController::class, 'index']);
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

    Route::middleware('role:player')->group(function () {
        Route::post('/venue-registrations', [VenueRegistrationController::class, 'store']);

        Route::get('/player-profile', [PlayerProfileController::class, 'show']);
        Route::patch('/player-profile', [PlayerProfileController::class, 'update']);

        Route::get('/skill-levels/mine', [SkillLevelController::class, 'mine']);

        Route::get('/matchmaking-requests/mine', [MatchmakingRequestController::class, 'mine']);
        Route::post('/matchmaking-requests', [MatchmakingRequestController::class, 'store']);
        Route::delete('/matchmaking-requests/{matchmakingRequest}', [MatchmakingRequestController::class, 'destroy']);
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
});
