<?php

use App\Http\Controllers\Admin\AdminDashboardController;
use App\Http\Controllers\Admin\AdminUserController;
use App\Http\Controllers\Admin\AuditLogController;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\CourtController;
use App\Http\Controllers\EquipmentController;
use App\Http\Controllers\VenueController;
use App\Http\Controllers\VenueRegistrationController;
use App\Models\Sport;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

Route::get('/sports', fn () => Sport::orderBy('name')->get());

Route::get('/venues', [VenueController::class, 'index']);
Route::get('/venues/{venue}', [VenueController::class, 'show']);

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
});
