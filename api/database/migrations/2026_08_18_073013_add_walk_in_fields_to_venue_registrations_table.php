<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('venue_registrations', function (Blueprint $table) {
            $table->string('walk_in_name')->nullable()->after('purpose');
            $table->string('walk_in_contact')->nullable()->after('walk_in_name');
        });

        // A walk-in booking the facilitator enters manually has no app
        // account to attribute it to — raw SQL avoids adding doctrine/dbal
        // (not installed) just for Blueprint::change().
        DB::statement('ALTER TABLE venue_registrations ALTER COLUMN user_id DROP NOT NULL');
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        DB::statement('ALTER TABLE venue_registrations ALTER COLUMN user_id SET NOT NULL');

        Schema::table('venue_registrations', function (Blueprint $table) {
            $table->dropColumn(['walk_in_name', 'walk_in_contact']);
        });
    }
};
