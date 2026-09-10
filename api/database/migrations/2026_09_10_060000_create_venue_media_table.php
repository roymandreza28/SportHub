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
        // Photos only (unlike news_media, no video) — a facilitator's venue
        // gallery, shown on the player-facing map popup and the venue
        // directory.
        Schema::create('venue_media', function (Blueprint $table) {
            $table->id();
            $table->foreignId('venue_id')->constrained()->cascadeOnDelete();
            $table->string('path');
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();

            $table->index(['venue_id', 'position']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('venue_media');
    }
};
