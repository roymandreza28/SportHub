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

    // Every per-conversation "..." menu action (mute/archive/hide/block/
    // report) needs nothing more than "you're a participant" — same gate as
    // view()/sendMessage(), kept as its own named method so a future action
    // that needs something stricter (e.g. only the group creator can leave-
    // and-delete-for-everyone) has an obvious place to diverge from it.
    public function manageParticipation(User $user, Conversation $conversation): bool
    {
        return $this->view($user, $conversation);
    }
}
