<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Basketball stat sheets were team-only (team_id required). Extending stat
// sheets to racquet sports' singles matches needs an individual participant
// (user_id) alongside team_id, since a singles match has no Team at all. No
// real data exists in this table yet, so it's simplest to drop and recreate
// with both columns nullable rather than ALTER a NOT NULL foreign key
// (this app has no doctrine/dbal installed, so Blueprint::change() isn't
// available anyway).
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('match_stat_sheets');

        Schema::create('match_stat_sheets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('match_id')->constrained('matches')->cascadeOnDelete();
            $table->foreignId('team_id')->nullable()->constrained('teams')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->cascadeOnDelete();
            $table->foreignId('sport_id')->constrained('sports')->cascadeOnDelete();
            $table->foreignId('filled_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->boolean('is_locked')->default(false);
            $table->timestamp('locked_at')->nullable();
            $table->json('data')->nullable();
            $table->timestamps();

            // Exactly one of team_id/user_id is ever set per row — each
            // constraint only ever applies to the rows where its own column
            // is non-null, so the two coexist without conflict.
            $table->unique(['match_id', 'team_id']);
            $table->unique(['match_id', 'user_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('match_stat_sheets');

        Schema::create('match_stat_sheets', function (Blueprint $table) {
            $table->id();
            $table->foreignId('match_id')->constrained('matches')->cascadeOnDelete();
            $table->foreignId('team_id')->constrained('teams')->cascadeOnDelete();
            $table->foreignId('sport_id')->constrained('sports')->cascadeOnDelete();
            $table->foreignId('filled_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->boolean('is_locked')->default(false);
            $table->timestamp('locked_at')->nullable();
            $table->json('data')->nullable();
            $table->timestamps();

            $table->unique(['match_id', 'team_id']);
        });
    }
};
