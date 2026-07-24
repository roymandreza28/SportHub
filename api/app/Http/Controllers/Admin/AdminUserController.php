<?php

namespace App\Http\Controllers\Admin;

use App\Events\SystemMetricUpdated;
use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AdminUserController extends Controller
{
    public function index(Request $request)
    {
        $users = User::query()
            ->with('roles:id,name')
            ->when($request->string('search')->toString(), function ($query, $search) {
                $query->where(fn ($q) => $q
                    ->where('name', 'ilike', "%{$search}%")
                    ->orWhere('email', 'ilike', "%{$search}%"));
            })
            ->orderBy('name')
            ->paginate(20);

        return $users;
    }

    public function updateRoles(Request $request, User $user)
    {
        $data = $request->validate([
            'roles' => ['present', 'array'],
            'roles.*' => ['string', 'exists:roles,name'],
        ]);

        $user->syncRoles($data['roles']);

        AuditLog::record($request->user(), 'user.roles_updated', $user, ['roles' => $data['roles']]);

        return [
            ...$user->toArray(),
            'roles' => $user->getRoleNames()->values(),
        ];
    }

    public function updatePassword(Request $request, User $user)
    {
        $data = $request->validate([
            'password' => ['required', 'string', 'min:8'],
        ]);

        $user->update(['password' => Hash::make($data['password'])]);

        AuditLog::record($request->user(), 'user.password_changed', $user);

        return response()->noContent();
    }

    public function updateStatus(Request $request, User $user)
    {
        $data = $request->validate([
            'is_active' => ['required', 'boolean'],
        ]);

        if ($user->is($request->user())) {
            abort(422, 'You cannot deactivate your own account.');
        }

        $user->update(['is_active' => $data['is_active']]);

        AuditLog::record($request->user(), $data['is_active'] ? 'user.activated' : 'user.deactivated', $user);

        return [
            ...$user->toArray(),
            'roles' => $user->getRoleNames()->values(),
        ];
    }

    public function destroy(Request $request, User $user)
    {
        if ($user->is($request->user())) {
            abort(422, 'You cannot delete your own account.');
        }

        AuditLog::record($request->user(), 'user.deleted', $user);

        $user->delete();

        return response()->noContent();
    }

    public function createFacilitator(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
        ]);

        $facilitator = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => Hash::make($data['password']),
        ]);

        $facilitator->assignRole('venue_facilitator');

        AuditLog::record($request->user(), 'facilitator.created', $facilitator);

        $facilitatorCount = User::role('venue_facilitator')->count();
        SystemMetricUpdated::dispatch('facilitator_count', $facilitatorCount);

        return response()->json([
            ...$facilitator->toArray(),
            'roles' => $facilitator->getRoleNames()->values(),
        ], 201);
    }
}
