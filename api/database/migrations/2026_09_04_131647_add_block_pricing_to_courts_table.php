<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Some courts (BRCC's badminton gymnasium, per the venue's real rate sheet —
// see VenueSeeder's own comment) aren't priced by the venue's flat
// price_per_hour × duration at all: they're sold as a fixed-length,
// fixed-price package (₱1,500 for a 3-hour block). block_hours/block_price
// let a specific court opt into that pricing model instead, without
// disturbing every other court still using the venue-level hourly rate.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('courts', function (Blueprint $table) {
            $table->unsignedSmallInteger('block_hours')->nullable()->after('capacity');
            $table->decimal('block_price', 8, 2)->nullable()->after('block_hours');
        });
    }

    public function down(): void
    {
        Schema::table('courts', function (Blueprint $table) {
            $table->dropColumn(['block_hours', 'block_price']);
        });
    }
};
