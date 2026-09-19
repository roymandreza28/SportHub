<?php

namespace App\Http\Controllers\Social;

use App\Events\ConversationMessageSent;
use App\Models\Conversation;
use App\Models\ConversationMessage;
use App\Models\User;
use App\Http\Controllers\Controller;
use App\Support\Broadcasting;
use App\Support\DirectConversations;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class ConversationMessageController extends Controller
{
    public function index(Request $request, Conversation $conversation)
    {
        $this->authorize('view', $conversation);

        return $conversation->messages()
            ->with([
                'user:id,name',
                'replyTo:id,user_id,body,attachment_path,removed_at',
                'replyTo.user:id,name',
                'forwardedFrom:id,user_id,body,attachment_path,removed_at',
                'forwardedFrom.user:id,name',
            ])
            ->orderBy('created_at')
            ->paginate(30);
    }

    public function store(Request $request, Conversation $conversation)
    {
        $this->authorize('sendMessage', $conversation);
        $this->abortIfBlocked($conversation);

        $data = $request->validate([
            // Either a caption or a photo (e.g. a GCash down-payment
            // screenshot for a booking conversation) is enough on its own —
            // the old text-only requirement would otherwise force typing
            // something just to attach an image.
            'body' => ['required_without:attachment', 'nullable', 'string', 'max:2000'],
            'attachment' => ['required_without:body', 'nullable', 'image', 'max:5120'],
            // Must belong to the SAME conversation — quoting a message
            // from somewhere else the sender can't even see would leak it.
            'reply_to_message_id' => [
                'nullable', 'integer',
                function ($attribute, $value, $fail) use ($conversation) {
                    if ($value && ! $conversation->messages()->whereKey($value)->exists()) {
                        $fail('That message is not part of this conversation.');
                    }
                },
            ],
        ]);

        $message = $conversation->messages()->create([
            'user_id' => $request->user()->id,
            'body' => $data['body'] ?? '',
            'attachment_path' => $request->hasFile('attachment')
                ? $request->file('attachment')->store('conversations/'.$conversation->id, 'public')
                : null,
            'reply_to_message_id' => $data['reply_to_message_id'] ?? null,
        ]);

        $this->reviveForEveryone($conversation);

        $message->load(['user:id,name', 'replyTo:id,user_id,body,attachment_path,removed_at', 'replyTo.user:id,name']);

        Broadcasting::safely(fn () => ConversationMessageSent::dispatch($message));

        return response()->json($message, 201);
    }

    // Messenger-style "Remove" — the author only, and never a hard delete:
    // the row stays (so the thread doesn't just silently shrink by one)
    // with its body/attachment cleared and removed_at set, which the
    // frontend renders as "You removed a message" / "{name} removed a
    // message" instead of the real content. The stored file itself IS
    // actually deleted from disk, same as a real unsend.
    public function destroy(Request $request, Conversation $conversation, ConversationMessage $message)
    {
        $this->authorizeMessageBelongsHere($conversation, $message);
        abort_unless($message->user_id === $request->user()->id, 403, 'You can only remove your own messages.');

        if ($message->attachment_path) {
            Storage::disk('public')->delete($message->attachment_path);
        }

        $message->update(['removed_at' => now(), 'body' => '', 'attachment_path' => null]);

        Broadcasting::safely(fn () => ConversationMessageSent::dispatch($message->fresh(['user:id,name'])));

        return response()->noContent();
    }

    // Any participant, not just the author — a shared pinned-messages list
    // is a property of the CONVERSATION, same as a real group chat's pin.
    public function pin(Request $request, Conversation $conversation, ConversationMessage $message)
    {
        $this->authorize('view', $conversation);
        $this->authorizeMessageBelongsHere($conversation, $message);

        $data = $request->validate(['pinned' => ['required', 'boolean']]);

        $message->update(['pinned_at' => $data['pinned'] ? now() : null]);

        Broadcasting::safely(fn () => ConversationMessageSent::dispatch($message->fresh(['user:id,name'])));

        return response()->noContent();
    }

    // Copies a message into ANOTHER conversation the viewer is also a
    // participant of — same "Forwarded" provenance real Messenger/WhatsApp
    // show, via forwarded_from_message_id (nullOnDelete, so if the
    // original later gets removed the copy just loses its "Forwarded"
    // source link, not the copy itself).
    public function forward(Request $request, Conversation $conversation, ConversationMessage $message)
    {
        $this->authorize('view', $conversation);
        $this->authorizeMessageBelongsHere($conversation, $message);
        abort_if($message->removed_at, 422, 'This message was removed and can\'t be forwarded.');

        $data = $request->validate(['conversation_id' => ['required', 'integer', 'exists:conversations,id']]);

        $target = Conversation::findOrFail($data['conversation_id']);
        $this->authorize('sendMessage', $target);
        $this->abortIfBlocked($target);

        $forwarded = $target->messages()->create([
            'user_id' => $request->user()->id,
            'body' => $message->body,
            'attachment_path' => $message->attachment_path,
            'forwarded_from_message_id' => $message->id,
        ]);

        $this->reviveForEveryone($target);

        $forwarded->load(['user:id,name', 'forwardedFrom:id,user_id', 'forwardedFrom.user:id,name']);

        Broadcasting::safely(fn () => ConversationMessageSent::dispatch($forwarded));

        return response()->json($forwarded, 201);
    }

    // Same "no admin moderation inbox exists yet" rationale as
    // ConversationController::report() — posts into the reporter's own
    // Contact Admin thread, quoting the specific message rather than just
    // naming the conversation.
    public function report(Request $request, Conversation $conversation, ConversationMessage $message)
    {
        $this->authorize('view', $conversation);
        $this->authorizeMessageBelongsHere($conversation, $message);

        $data = $request->validate(['reason' => ['required', 'string', 'max:1000']]);

        $reporter = $request->user();
        $admin = User::role('admin')->orderBy('id')->first();
        abort_unless($admin, 503, 'Support is not available right now.');
        abort_if($reporter->id === $admin->id, 422, 'You are the admin.');

        $adminThread = DirectConversations::between($reporter, $admin);

        $quoted = $message->removed_at
            ? '(message no longer available)'
            : ($message->body ?: ($message->attachment_path ? '[photo]' : ''));

        $reportMessage = $adminThread->messages()->create([
            'user_id' => $reporter->id,
            'body' => "\u{26A0} Reported a message from {$message->user?->name} in conversation #{$conversation->id}:\n\n\"{$quoted}\"\n\nReason: {$data['reason']}",
        ]);
        $reportMessage->load('user:id,name');

        Broadcasting::safely(fn () => ConversationMessageSent::dispatch($reportMessage));

        return response()->noContent();
    }

    private function authorizeMessageBelongsHere(Conversation $conversation, ConversationMessage $message): void
    {
        abort_unless($message->conversation_id === $conversation->id, 404);
    }

    private function abortIfBlocked(Conversation $conversation): void
    {
        // Blocked is stored on whichever participant's own row set it (see
        // ConversationController::block()) — either side blocking silences
        // both directions in a direct conversation, so this checks the
        // WHOLE pivot for the thread, not just the sender's own row.
        if ($conversation->type === 'direct') {
            $blocked = $conversation->participants()->wherePivotNotNull('blocked_at')->exists();
            abort_if($blocked, 403, 'You can\'t send messages in this conversation.');
        }
    }

    // New activity un-hides/un-archives the thread for EVERY participant
    // (including the sender, if they'd archived their own copy) — mirrors
    // Messenger: archiving or deleting a chat only holds until something
    // new happens in it.
    private function reviveForEveryone(Conversation $conversation): void
    {
        DB::table('conversation_participants')
            ->where('conversation_id', $conversation->id)
            ->update(['archived_at' => null, 'hidden_at' => null]);
    }
}
