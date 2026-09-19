<?php

namespace App\Support;

use App\Models\Conversation;
use App\Models\User;
use Illuminate\Support\Facades\DB;

// Extracted from ConversationController — shared by its own store()/
// contactAdmin()/contactColleague() AND ConversationMessageController::
// report() (which needs to post into the reporter's own Contact Admin
// thread), all of which ultimately just need "the one direct conversation
// between these two people," created if it doesn't exist yet.
class DirectConversations
{
    public static function between(User $a, User $b): Conversation
    {
        return DB::transaction(function () use ($a, $b) {
            $conversation = Conversation::firstOrCreate(
                ['direct_key' => Conversation::directKeyFor($a->id, $b->id)],
                ['type' => 'direct', 'created_by' => $a->id]
            );

            if ($conversation->wasRecentlyCreated) {
                $conversation->participants()->attach([$a->id, $b->id]);
            }

            return $conversation;
        });
    }
}
