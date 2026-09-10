<?php

namespace App\Policies;

use App\Models\Evaluation;
use App\Models\User;

class EvaluationPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->can('evaluate player');
    }

    public function create(User $user): bool
    {
        return $user->can('evaluate player');
    }

    // Only the coach who wrote an evaluation can correct it — 'evaluate
    // player' alone (checked on create/viewAny above) isn't ownership, it's
    // just "this account is a coach."
    public function update(User $user, Evaluation $evaluation): bool
    {
        return $user->can('evaluate player') && $evaluation->coach_id === $user->id;
    }
}
