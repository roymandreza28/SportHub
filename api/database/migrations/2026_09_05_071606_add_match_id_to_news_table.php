<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Lets a news post reference the specific game it's about (set by
// ShareMatchModal.tsx's "Share to newsfeed" flow), distinct from the
// existing tournament_id (which a post can carry with no specific match in
// mind, e.g. the champion-crowned announcement). Nullable + nullOnDelete,
// same shape as tournament_id's own migration — a post survives its match
// being deleted, it just stops rendering a live score.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('news', function (Blueprint $table) {
            $table->foreignId('match_id')->nullable()->after('tournament_id')->constrained('matches')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('news', function (Blueprint $table) {
            $table->dropConstrainedForeignId('match_id');
        });
    }
};
