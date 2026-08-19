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
        Schema::table('news', function (Blueprint $table) {
            // Not unique — a tournament ends up with two posts over its
            // life: the creation announcement and the completion
            // congratulations.
            $table->foreignId('tournament_id')->nullable()->after('author_id')
                ->constrained('tournaments')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('news', function (Blueprint $table) {
            $table->dropConstrainedForeignId('tournament_id');
        });
    }
};
