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
        Schema::create('matchmaking_matches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('request_a_id')->constrained('matchmaking_requests')->cascadeOnDelete();
            $table->foreignId('request_b_id')->constrained('matchmaking_requests')->cascadeOnDelete();
            $table->timestamp('matched_at');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('matchmaking_matches');
    }
};
