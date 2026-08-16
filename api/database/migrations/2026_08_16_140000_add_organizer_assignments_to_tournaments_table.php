<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tournaments', function (Blueprint $table) {
            $table->foreignId('venue_organizer_id')->nullable()->after('venue_id')->constrained('users')->nullOnDelete();
            $table->foreignId('livestream_organizer_id')->nullable()->after('venue_organizer_id')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('tournaments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('venue_organizer_id');
            $table->dropConstrainedForeignId('livestream_organizer_id');
        });
    }
};
