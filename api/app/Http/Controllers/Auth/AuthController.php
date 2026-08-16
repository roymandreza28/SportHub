<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\AuditLog;
use App\Models\User;
use App\Services\NotificationService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function register(Request $request)
    {
        $data = $request->validate([
            'first_name' => ['required', 'string', 'max:255'],
            'middle_name' => ['nullable', 'string', 'max:255'],
            'last_name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email', 'max:255', 'unique:users,email'],
            'birthday' => ['required', 'date', 'before:today'],
            'address' => ['required', 'string', 'max:500'],
            // Proof of address: a valid ID or a billing statement, either as
            // an image or a scanned/exported PDF.
            'proof_of_address' => ['required', 'file', 'mimes:jpg,jpeg,png,pdf', 'max:5120'],
            'role' => ['required', Rule::in(['player', 'coach'])],
            // Only a coach registrant has to additionally prove they're
            // qualified to coach players.
            'coach_eligibility_proof' => [
                Rule::requiredIf($request->input('role') === 'coach'),
                'file', 'mimes:jpg,jpeg,png,pdf', 'max:5120',
            ],
            'password' => [
                'required', 'string', 'confirmed',
                Password::min(8)->mixedCase()->numbers(),
                function ($attribute, $value, $fail) use ($request) {
                    if ($request->filled('birthday') && $this->matchesBirthday($value, $request->input('birthday'))) {
                        $fail('Your password cannot be your birthday.');
                    }
                },
            ],
        ]);

        $user = DB::transaction(function () use ($data, $request) {
            $fullName = collect([$data['first_name'], $data['middle_name'] ?? null, $data['last_name']])
                ->filter()
                ->implode(' ');

            $user = User::create([
                'name' => $fullName,
                'first_name' => $data['first_name'],
                'middle_name' => $data['middle_name'] ?? null,
                'last_name' => $data['last_name'],
                'email' => $data['email'],
                'birthday' => $data['birthday'],
                'address' => $data['address'],
                'password' => Hash::make($data['password']),
                // Every self-registered player/coach starts pending — an
                // admin has to verify their submitted proof before they get
                // full access. Accounts created any other way (seeders,
                // admin-created facilitators) keep the column's default of
                // 'verified' instead.
                'verification_status' => 'pending',
            ]);

            $user->update([
                'proof_of_address_path' => $request->file('proof_of_address')->store('proof-of-address/'.$user->id, 'public'),
            ]);

            if ($data['role'] === 'coach') {
                $user->update([
                    'coach_eligibility_proof_path' => $request->file('coach_eligibility_proof')->store('coach-eligibility/'.$user->id, 'public'),
                ]);
                // A coach account also carries the player role — a coach can
                // be evaluated/booked like any other player (see roles.ts).
                $user->assignRole(['coach', 'player']);
            } else {
                $user->assignRole('player');
            }

            return $user;
        });

        NotificationService::send($user, 'account_pending_verification', [
            'message' => "Your account is under verification. You can't access other services at the moment.",
        ]);

        Auth::login($user);
        $request->session()->regenerate();

        return response()->json($this->withRoles($user->fresh()));
    }

    // Rejects a password that's just the birthday typed in any of the
    // common date formats — "harder to guess than your own birthday" is a
    // low bar, but a real one.
    private function matchesBirthday(string $password, string $birthday): bool
    {
        $date = Carbon::parse($birthday);

        $variants = [
            $date->format('Y-m-d'), $date->format('Ymd'),
            $date->format('m/d/Y'), $date->format('m-d-Y'), $date->format('mdY'),
            $date->format('d/m/Y'), $date->format('d-m-Y'), $date->format('dmY'),
            $date->format('m/d/y'), $date->format('d/m/y'),
        ];

        return in_array($password, $variants, true);
    }

    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email' => ['required', 'string', 'email'],
            'password' => ['required', 'string'],
        ]);

        if (! Auth::attempt($credentials)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        if (! Auth::user()->is_active) {
            Auth::logout();

            throw ValidationException::withMessages([
                'email' => ['Your account has been deactivated. Please contact an administrator.'],
            ]);
        }

        $request->session()->regenerate();

        return response()->json($this->withRoles(Auth::user()));
    }

    public function updatePassword(Request $request)
    {
        $data = $request->validate([
            'current_password' => ['required', 'current_password'],
            'password' => ['required', 'string', 'min:8'],
        ]);

        $request->user()->update(['password' => Hash::make($data['password'])]);

        AuditLog::record($request->user(), 'user.password_changed_self');

        return response()->noContent();
    }

    public function updateAvatar(Request $request)
    {
        $data = $request->validate([
            'avatar' => ['required', 'image', 'mimes:jpg,jpeg,png,webp', 'max:5120'],
        ]);

        $user = $request->user();

        if ($user->avatar_path) {
            Storage::disk('public')->delete($user->avatar_path);
        }

        $user->update(['avatar_path' => $request->file('avatar')->store('avatars/'.$user->id, 'public')]);

        return response()->json($this->withRoles($user->fresh()));
    }

    public function logout(Request $request)
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }

    protected function withRoles(User $user): array
    {
        return [
            ...$user->toArray(),
            'roles' => $user->getRoleNames()->values(),
        ];
    }
}
