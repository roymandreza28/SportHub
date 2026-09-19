<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

// Clears tournament/bracket/match/team/matchmaking/venue-booking/newsfeed/
// skill-evaluation/social data while leaving venues+courts+equipment, user
// accounts+profiles, and reference data (sports/sport_formats/roles)
// untouched. Deletes only the top-level owning table per group — the FK
// ON DELETE CASCADE/SET NULL rules already declared in the migrations (see
// e.g. create_tournaments_table.php, create_teams_table.php,
// create_news_table.php, create_conversations_table.php) take care of every
// dependent row exactly as they would for any other delete, without the
// blanket-truncate risk of `TRUNCATE ... CASCADE` pulling in unrelated
// tables that merely reference one of these (e.g. news.tournament_id, which
// is nullOnDelete, not owned).
class ResetTournamentAndNewsfeedData extends Command
{
    protected $signature = 'system:reset-tournaments-and-newsfeed
        {--force : Skip the confirmation prompt}
        {--dry-run : Only report row counts, delete nothing}';

    protected $description = 'Delete tournament/bracket/match/team/matchmaking/venue-booking/newsfeed/skill-evaluation/friendship/chat/post/notification data, keeping venues, user accounts, and reference data intact';

    // Deleting each of these cascades to everything it owns (see the
    // migration that declared each FK) — order doesn't strictly matter since
    // every relevant FK is either cascadeOnDelete or nullOnDelete, but this
    // keeps the summary output readable top-down.
    private const TOP_LEVEL_TABLES = [
        'tournaments',          // -> tournament_registrations, brackets -> matches -> match_events, match_stat_sheets, match_player_stats
        'teams',                // -> team_members
        'livestreams',
        'news',                 // -> news_comments, news_reactions, news_media
        'venue_registrations',
        'matchmaking_requests', // -> matchmaking_matches
        'skill_levels',         // -> evaluations
        'friendships',
        'conversations',        // -> conversation_participants, conversation_messages
        'posts',                // -> post_media
        'notifications',
    ];

    public function handle(): int
    {
        $before = collect(self::TOP_LEVEL_TABLES)->mapWithKeys(
            fn ($table) => [$table => DB::table($table)->count()]
        );

        $this->table(['Table', 'Rows before delete'], $before->map(fn ($n, $t) => [$t, $n])->values());

        if ($before->sum() === 0) {
            $this->info('Nothing to clear — every listed table is already empty.');

            return self::SUCCESS;
        }

        if ($this->option('dry-run')) {
            $this->info('Dry run — no rows were deleted.');

            return self::SUCCESS;
        }

        if (! $this->option('force') && ! $this->confirm(
            'This permanently deletes '.$before->sum().' rows across '.$before->count().' tables (plus everything cascading from them). Continue?'
        )) {
            $this->warn('Aborted.');

            return self::FAILURE;
        }

        DB::transaction(function () {
            foreach (self::TOP_LEVEL_TABLES as $table) {
                DB::table($table)->delete();
            }
        });

        $after = collect(self::TOP_LEVEL_TABLES)->mapWithKeys(fn ($table) => [$table => DB::table($table)->count()]);
        $this->table(['Table', 'Rows after delete'], $after->map(fn ($n, $t) => [$t, $n])->values());

        $this->info('Tournament, team, matchmaking, venue-booking, newsfeed, skill-evaluation, friendship, chat, post, and notification data cleared. Venues, user accounts, and reference data were left untouched.');

        return self::SUCCESS;
    }
}
