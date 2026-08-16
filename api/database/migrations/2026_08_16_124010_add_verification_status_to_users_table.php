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
        Schema::table('users', function (Blueprint $table) {
            // Defaults to 'verified' so every existing account (seeded demo
            // users, admin-created facilitators, anything already in the
            // database) stays fully functional — only new player/coach
            // self-registrations are explicitly set to 'pending' by
            // AuthController::register().
            $table->string('verification_status')->default('verified')->after('is_active');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('verification_status');
        });
    }
};
