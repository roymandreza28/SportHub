<?php

namespace App\Http\Controllers\Admin;

use App\Events\SystemMetricUpdated;
use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\User;
use App\Services\NotificationService;
use App\Support\Broadcasting;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

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

    // A focused queue for the admin's Verification tab — every
    // player/coach still awaiting a decision, with their submitted proof
    // documents resolved to viewable URLs. Deliberately a separate
    // endpoint from index(): those document URLs are sensitive enough
    // that they shouldn't ride along on the general, broader user list.
    public function pendingVerifications(Request $request)
    {
        return User::query()
            ->whereIn('verification_status', ['pending', 'rejected'])
            ->with('roles:id,name')
            ->orderBy('created_at')
            ->get()
            ->map(fn (User $user) => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
                'birthday' => $user->birthday,
                'address' => $user->address,
                'verification_status' => $user->verification_status,
                'created_at' => $user->created_at,
                // The already eager-loaded roles:id,name relation, not
                // getRoleNames() — that returns plain strings, not the
                // {id, name} shape the frontend renders here.
                'roles' => $user->roles,
                'proof_of_address_url' => $user->proof_of_address_path
                    ? Storage::disk('public')->url($user->proof_of_address_path)
                    : null,
                'coach_eligibility_proof_url' => $user->coach_eligibility_proof_path
                    ? Storage::disk('public')->url($user->coach_eligibility_proof_path)
                    : null,
            ]);
    }

    public function updateRoles(Request $request, User $user)
    {
        $data = $request->validate([
            'roles' => ['present', 'array'],
            'roles.*' => ['string', 'exists:roles,name'],
        ]);

        $user->syncRoles($data['roles']);

        AuditLog::record($request->user(), 'user.roles_updated', $user, ['roles' => $data['roles']]);

        return $this->withRoles($user);
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

        return $this->withRoles($user);
    }

    public function updateVerification(Request $request, User $user)
    {
        $data = $request->validate([
            'verification_status' => ['required', Rule::in(['pending', 'verified', 'rejected'])],
        ]);

        $user->update(['verification_status' => $data['verification_status']]);

        AuditLog::record($request->user(), 'user.verification_'.$data['verification_status'], $user);

        if ($data['verification_status'] === 'verified') {
            NotificationService::send($user, 'account_verified', [
                'message' => 'Your account has been verified — you now have full access.',
            ]);
        } elseif ($data['verification_status'] === 'rejected') {
            NotificationService::send($user, 'account_rejected', [
                'message' => 'Your account verification was rejected. Please contact an administrator.',
            ]);
        }

        return $this->withRoles($user);
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
        Broadcasting::safely(fn () => SystemMetricUpdated::dispatch('facilitator_count', $facilitatorCount));

        return response()->json($this->withRoles($facilitator), 201);
    }

    // The 3 organizer account types: 'main' is the full-featured organizer
    // role unchanged; 'venue' and 'scoreboard'-scoped 'livestream' sub-roles
    // exist so an admin can staff a tournament with courtside/AV help
    // without handing them tournament/news management too.
    public function createOrganizer(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8'],
            'type' => ['required', Rule::in(['main', 'venue', 'livestream'])],
        ]);

        $role = match ($data['type']) {
            'main' => 'organizer',
            'venue' => 'venue_organizer',
            'livestream' => 'livestream_organizer',
        };

        $organizer = User::create([
            'name' => $data['name'],
            'email' => $data['email'],
            'password' => Hash::make($data['password']),
        ]);

        $organizer->assignRole($role);

        AuditLog::record($request->user(), 'organizer.created', $organizer, ['type' => $data['type']]);

        return response()->json($this->withRoles($organizer), 201);
    }

    // Every mutation endpoint here returns the affected user plus their
    // roles — kept as the eager-loaded {id, name} relation shape (matching
    // index()/pendingVerifications()), not getRoleNames(), which returns
    // plain strings and silently breaks any frontend code expecting role
    // objects (e.g. `.name`, `.id`).
    private function withRoles(User $user): array
    {
        $user->load('roles:id,name');

        return [
            ...$user->toArray(),
            'roles' => $user->roles,
        ];
    }
}
