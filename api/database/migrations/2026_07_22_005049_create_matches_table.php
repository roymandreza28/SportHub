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
        Schema::create('matches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bracket_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('round');
            $table->foreignId('participant_a_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('participant_b_id')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedInteger('score_a')->default(0);
            $table->unsignedInteger('score_b')->default(0);
            $table->enum('status', ['scheduled', 'live', 'completed'])->default('scheduled');
            $table->foreignId('court_id')->nullable()->constrained()->nullOnDelete();
            $table->timestamp('scheduled_at')->nullable();
            $table->foreignId('winner_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('matches');
    }
};
