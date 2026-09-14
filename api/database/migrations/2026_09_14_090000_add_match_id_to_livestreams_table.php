<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Lets a livestream be tied to one specific game rather than only ever the
// whole tournament — multiple courts running simultaneously in the same
// tournament can now each have their own broadcast. Nullable + nullOnDelete,
// same shape as tournament_id's own column (and News.match_id, the exact
// precedent this mirrors) — a stream with no match_id is still a valid
// whole-tournament broadcast, unchanged from today's only option.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('livestreams', function (Blueprint $table) {
            $table->foreignId('match_id')->nullable()->after('tournament_id')->constrained('matches')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('livestreams', function (Blueprint $table) {
            $table->dropConstrainedForeignId('match_id');
        });
    }
};
