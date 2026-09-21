<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tournaments', function (Blueprint $table) {
            // Null = open to any gender (the default for every existing
            // tournament). Set = only players/teams of that gender may
            // register — enforced in TournamentRegistrationController's
            // store()/storeTeam(), the same place sport_format_id's
            // individual-vs-team gate already lives.
            $table->string('required_gender')->nullable()->after('sport_format_id');
        });
    }

    public function down(): void
    {
        Schema::table('tournaments', function (Blueprint $table) {
            $table->dropColumn('required_gender');
        });
    }
};
