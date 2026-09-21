<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Nullable at the DB level (like birthday/address/phone before
            // it) — enforced as required via AuthController::register()'s
            // own validation instead, so accounts created any other way
            // (seeders, admin-created facilitators/organizers) aren't
            // blocked by a NOT NULL constraint they have no form for.
            $table->string('gender')->nullable()->after('birthday');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('gender');
        });
    }
};
