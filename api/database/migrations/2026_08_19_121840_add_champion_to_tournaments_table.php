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
        Schema::table('tournaments', function (Blueprint $table) {
            $table->foreignId('champion_id')->nullable()->after('status')->constrained('users')->nullOnDelete();
            $table->foreignId('champion_team_id')->nullable()->after('champion_id')->constrained('teams')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('tournaments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('champion_team_id');
            $table->dropConstrainedForeignId('champion_id');
        });
    }
};
