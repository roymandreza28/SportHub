<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('push_subscriptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // One row per browser/device subscription (the endpoint URL the
            // push service gave that device) — a user can have several
            // (phone + laptop), so this isn't unique per user, only per
            // endpoint. Unique on endpoint alone: re-subscribing the same
            // device (e.g. after logging out and back in as someone else on
            // a shared device) reassigns the row to the new user instead of
            // erroring or leaving a stale duplicate — see
            // PushSubscriptionController::store()'s updateOrCreate.
            $table->string('endpoint', 500)->unique();
            $table->string('public_key');
            $table->string('auth_token');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('push_subscriptions');
    }
};
