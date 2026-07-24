<?php

namespace App\Policies;

use App\Models\Conversation;
use App\Models\User;

class ConversationPolicy
{
    public function create(User $user): bool
    {
        return $user->can('use chat');
    }

    public function view(User $user, Conversation $conversation): bool
    {
        return $conversation->participants()->where('users.id', $user->id)->exists();
    }

    public function sendMessage(User $user, Conversation $conversation): bool
    {
        return $this->view($user, $conversation);
    }

    public function addParticipant(User $user, Conversation $conversation): bool
    {
        return $conversation->type === 'group' && $this->view($user, $conversation);
    }
}
