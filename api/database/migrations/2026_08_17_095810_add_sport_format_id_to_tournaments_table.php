<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tournaments', function (Blueprint $table) {
            // Null = individual tournament (unchanged legacy behavior). Set
            // = team tournament — every registration/match slot pairs a
            // Team instead of a User.
            $table->foreignId('sport_format_id')->nullable()->after('sport_id')
                ->constrained('sport_formats')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('tournaments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('sport_format_id');
        });
    }
};
