<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    // No confirmed facility or official venue for these in Morong, Rizal
    // (see SportsSeeder for what remains and why). Deleting the Sport row
    // cascades to its sport_formats, matchmaking_requests, skill_levels,
    // teams, and tournaments — acceptable here since this is pre-launch
    // seed/dev data, not real user records.
    private const UNSUPPORTED_SPORTS = ['Football', 'Table Tennis', 'Tennis', 'Swimming', 'Athletics', 'Chess'];

    // Fictional placeholder venues from earlier seed data — "Wawa River
    // Park" in particular assumed Wawa was in Morong, but it's actually in
    // Rodriguez, Rizal. SampleDataSeeder now seeds real, named Morong
    // venues (Morong Gymnasium, Tapal's Badminton Center) instead.
    private const FICTIONAL_VENUES = ['Morong Sports Complex', 'Wawa River Park'];

    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Raw query builder, not the Eloquent models — a migration is a
        // frozen historical step, but a model class is current application
        // code. Venue later gained a SoftDeletes trait, and Eloquent
        // silently adds a `deleted_at is null` filter to every query once a
        // model uses it; on a full fresh migrate that filter would be
        // applied here before the `deleted_at` column even exists yet
        // (added by a later migration), breaking the query outright.
        DB::table('sports')->whereIn('name', self::UNSUPPORTED_SPORTS)->delete();
        DB::table('venues')->whereIn('name', self::FICTIONAL_VENUES)->delete();
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // Deliberately irreversible — the sports were removed because no
        // real facility for them exists in Morong, not due to a mistake.
    }
};
