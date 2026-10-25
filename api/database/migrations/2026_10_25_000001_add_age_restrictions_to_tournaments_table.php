<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('tournaments', function (Blueprint $table) {
            $table->unsignedTinyInteger('min_age')->nullable()->after('required_gender');
            $table->unsignedTinyInteger('max_age')->nullable()->after('min_age');
        });
    }

    public function down(): void
    {
        Schema::table('tournaments', function (Blueprint $table) {
            $table->dropColumn(['min_age', 'max_age']);
        });
    }
};
