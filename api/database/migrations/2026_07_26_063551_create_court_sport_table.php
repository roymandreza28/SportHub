<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     *
     * A court used to support exactly one sport (courts.sport_id). Real
     * venues often share one physical court across sports (a tennis court
     * lined for pickleball too), so this replaces that single FK with a
     * many-to-many pivot. Existing sport_id values are copied into the
     * pivot before the column is dropped, using raw query-builder calls
     * (not the Court/Sport Eloquent models) — a migration is a frozen
     * historical step, and depending on current model code has already
     * broken a fresh migrate once before in this project (see
     * 2026_07_25_145915_remove_sports_without_morong_facilities).
     */
    public function up(): void
    {
        Schema::create('court_sport', function (Blueprint $table) {
            $table->id();
            $table->foreignId('court_id')->constrained()->cascadeOnDelete();
            $table->foreignId('sport_id')->constrained()->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['court_id', 'sport_id']);
        });

        $now = now();
        $rows = DB::table('courts')
            ->whereNotNull('sport_id')
            ->get(['id', 'sport_id'])
            ->map(fn ($court) => [
                'court_id' => $court->id,
                'sport_id' => $court->sport_id,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

        if ($rows->isNotEmpty()) {
            DB::table('court_sport')->insert($rows->all());
        }

        Schema::table('courts', function (Blueprint $table) {
            $table->dropConstrainedForeignId('sport_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('courts', function (Blueprint $table) {
            $table->foreignId('sport_id')->nullable()->after('name')->constrained('sports')->nullOnDelete();
        });

        // Best-effort restore of the first associated sport per court — a
        // court now tagged with more than one sport can't fully round-trip
        // back into a single-sport column.
        DB::table('court_sport')
            ->selectRaw('DISTINCT ON (court_id) court_id, sport_id')
            ->orderBy('court_id')
            ->orderBy('id')
            ->get()
            ->each(fn ($row) => DB::table('courts')->where('id', $row->court_id)->update(['sport_id' => $row->sport_id]));

        Schema::dropIfExists('court_sport');
    }
};
