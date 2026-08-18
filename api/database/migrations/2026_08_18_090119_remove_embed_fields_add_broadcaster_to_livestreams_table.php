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
        Schema::table('livestreams', function (Blueprint $table) {
            $table->dropColumn(['platform', 'embed_url']);
            $table->foreignId('broadcaster_id')->nullable()->after('tournament_id')
                ->constrained('users')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('livestreams', function (Blueprint $table) {
            $table->dropConstrainedForeignId('broadcaster_id');
            $table->enum('platform', ['youtube', 'facebook'])->default('youtube');
            $table->string('embed_url')->default('');
        });
    }
};
