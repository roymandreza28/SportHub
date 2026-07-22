<?php

namespace App\Providers;

use App\Models\GameMatch;
use App\Models\User;
use App\Policies\MatchPolicy;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Gate::before(fn (User $user, string $ability) => $user->hasRole('admin') ? true : null);

        // GameMatch doesn't follow the {Model}Policy auto-discovery convention
        // (the model is named GameMatch — "Match" alone is a reserved word in PHP 8).
        Gate::policy(GameMatch::class, MatchPolicy::class);
    }
}
