<?php

use App\Http\Controllers\Admin\AdminDashboardController;
use App\Http\Controllers\Admin\AdminUserController;
use App\Http\Controllers\Admin\AuditLogController;
use App\Http\Controllers\Auth\AuthController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

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
});
