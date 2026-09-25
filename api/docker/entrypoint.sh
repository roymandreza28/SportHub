#!/bin/sh
set -e

# The public port varies per platform/deploy (Railway and Render both assign
# it at runtime via $PORT), so the nginx config can't be static — render it
# from the template on every boot. This runs for both the web and reverb
# services; it's a no-op cost for reverb since that service overrides CMD
# and never starts nginx.
envsubst '${PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Config caching needs to happen after the platform's env vars are actually
# present in the process environment, i.e. at container boot, not at image
# build time. Deliberately not running `route:cache`: routes/api.php has a
# couple of closure-based routes (/user, /players), and route caching can't
# serialize closures — it throws, which would crash the container on boot.
php artisan config:cache

# Railway's preDeployCommand (railway.web.json) runs this before traffic
# switches to the new version, which is the cleaner place for it — but
# Render's free plan doesn't support pre-deploy commands at all ("Commands
# can only run on paid instance types"), silently skipping them rather than
# erroring, so migrations must also happen here as a fallback. Running
# migrate is idempotent, so doing it in both places on Railway is harmless.
# Gated to the web service's own default CMD (this file's "$1" is the first
# argument of whatever CMD/dockerCommand actually runs) so the reverb
# service — sharing this same image and entrypoint — never races it.
if [ "$1" = "supervisord" ]; then
    php artisan migrate --force

    # Same fallback rationale as migrate above: nothing else in this
    # deploy pipeline (Dockerfile build, Render's own predeploy) ever runs
    # `storage:link`, so public/storage never gets created and every
    # uploaded file (avatars, covers, news media) 404s. Laravel's own
    # command already no-ops safely if the link exists.
    php artisan storage:link || true

    # Opt-in, one-shot seeding hook — the free plan also can't run
    # `render jobs create` ("new paid services not allowed"), so this is the
    # only way to run a one-off artisan command at all on it. Every seeder
    # in this codebase is firstOrCreate/findOrCreate-based, so leaving this
    # flag set across multiple boots is harmless, not just a one-time
    # allowance. Unset SEED_ON_BOOT (or leave it unset) once seeding is done
    # so ordinary restarts don't pay the extra query cost.
    #
    # `|| true`, deliberately: without it, a failed seed — e.g. a duplicate-
    # key error from a slow-starting container getting killed and restarted
    # mid-seed, which happened here — takes the whole script down under
    # `set -e` before nginx/php-fpm ever start, which then loops forever
    # (Render restarts the crashed container, which fails the same way).
    # Seeding is not essential to serving traffic; let it log and move on.
    if [ "$SEED_ON_BOOT" = "true" ]; then
        php artisan db:seed --force || echo "db:seed failed — continuing boot anyway"
    fi

    # Narrower sibling of SEED_ON_BOOT — re-syncs just role/permission
    # grants (RolesAndPermissionsSeeder::syncPermissions()) without also
    # running DatabaseSeeder's full demo-data seeders, which would
    # repopulate a deliberately-emptied production database with sample
    # tournaments/teams/players. Use this after a role gains/loses a
    # permission (e.g. venue_facilitator getting 'manage tournaments') on
    # a database you don't want DatabaseSeeder's other seeders touching.
    # Unset after use, same as the flags above.
    if [ "$SEED_ROLES_ON_BOOT" = "true" ]; then
        php artisan db:seed --class=RolesAndPermissionsSeeder --force || echo "RolesAndPermissionsSeeder failed — continuing boot anyway"
    fi

    # Another narrow sibling of SEED_ON_BOOT — backfills team logos and
    # player/coach photos onto whatever teams/users already exist, without
    # touching tournaments or newsfeed posts the way DatabaseSeeder's other
    # seeders (SampleDataSeeder's Tournament::query()->delete(),
    # NewsfeedSeeder's News::query()->delete()) would. Safe to leave set
    # across multiple boots — TeamAndPlayerImagerySeeder only fills in
    # teams/users that don't already have an image, so a second run is a
    # no-op — but still unset once it's done so ordinary restarts don't pay
    # the extra query cost checking for images to fill in.
    if [ "$SEED_TEAM_AND_PLAYER_IMAGERY_ON_BOOT" = "true" ]; then
        php artisan db:seed --class=TeamAndPlayerImagerySeeder --force || echo "TeamAndPlayerImagerySeeder failed — continuing boot anyway"
    fi

    # Another narrow sibling of SEED_ON_BOOT — backfills randomized skill-
    # level evaluations across every seeded player (a player with zero
    # existing skill_levels rows gets a random 0-4 sports evaluated by a
    # random coach; a player who already has at least one is left alone
    # entirely). Same rationale as SEED_TEAM_AND_PLAYER_IMAGERY_ON_BOOT for
    # needing its own narrow flag rather than SEED_ON_BOOT: this only adds
    # to what's already there, it never wipes tournaments/newsfeed data.
    # Safe to leave set across multiple boots (PlayerSkillEvaluationSeeder
    # only ever fills in via updateOrCreate(), respecting skill_levels'
    # own unique(player_profile_id, sport_id) constraint) — still unset
    # once it's done so ordinary restarts don't pay the extra query cost.
    if [ "$SEED_SKILL_EVALUATIONS_ON_BOOT" = "true" ]; then
        php artisan db:seed --class=PlayerSkillEvaluationSeeder --force || echo "PlayerSkillEvaluationSeeder failed — continuing boot anyway"
    fi

    # Same one-shot-hook pattern as SEED_ON_BOOT above, for the opposite
    # operation — wiping every table except accounts/roles/sports back to a
    # fresh state. --force skips the interactive confirmation prompt, which
    # would otherwise hang forever with no stdin attached. Unset
    # RESET_ON_BOOT after use — unlike seeding, leaving this set would wipe
    # the database again on every future restart.
    if [ "$RESET_ON_BOOT" = "true" ]; then
        php artisan system:reset-keep-accounts --force || echo "system:reset-keep-accounts failed — continuing boot anyway"
    fi

    # Narrower sibling of RESET_ON_BOOT — clears tournament/bracket/match/
    # team/livestream/newsfeed/matchmaking/skill-evaluation/social data only,
    # leaving venues/courts/equipment, accounts, and sports/formats intact
    # (see ResetTournamentAndNewsfeedData's own doc comment for the exact
    # table list). Use this to clear out demo tournament data without also
    # wiping the venues, which took real effort to seed with real locations.
    # Same one-shot pattern as RESET_ON_BOOT — unset after use, since running
    # it again on a later boot would just re-wipe whatever was seeded since.
    # Runs before SEED_BASKETBALL_FORMATS_ON_BOOT below so the two can be set
    # together in a single deploy: clear, then reseed, in one boot.
    if [ "$RESET_TOURNAMENTS_ON_BOOT" = "true" ]; then
        php artisan system:reset-tournaments-and-newsfeed --force || echo "system:reset-tournaments-and-newsfeed failed — continuing boot anyway"
    fi

    # Narrower sibling of SEED_ON_BOOT, for the four full-detail format-demo
    # seeders covering double_elimination (Basketball) plus
    # round_robin/group_stage/swiss (Badminton Singles) (each already at
    # their final round — see the seeder classes' own doc comments). UNLIKE
    # the other seeders in this file, these are NOT idempotent —
    # Tournament::create() runs unconditionally every time, so leaving this
    # flag set across a second boot would create duplicate tournaments.
    # Unset it immediately after the one deploy that needed it, same as
    # RESET_ON_BOOT above (not "harmless to leave on" like SEED_ON_BOOT's
    # firstOrCreate-based seeders).
    if [ "$SEED_BASKETBALL_FORMATS_ON_BOOT" = "true" ]; then
        php artisan db:seed --class=DoubleEliminationBasketballTournamentSeeder --force || echo "DoubleEliminationBasketballTournamentSeeder failed — continuing boot anyway"
        php artisan db:seed --class=RoundRobinBadmintonTournamentSeeder --force || echo "RoundRobinBadmintonTournamentSeeder failed — continuing boot anyway"
        php artisan db:seed --class=GroupStageBadmintonTournamentSeeder --force || echo "GroupStageBadmintonTournamentSeeder failed — continuing boot anyway"
        php artisan db:seed --class=SwissBadmintonTournamentSeeder --force || echo "SwissBadmintonTournamentSeeder failed — continuing boot anyway"

        # Unlike the tournament seeders below, these two ARE safe to leave
        # set across multiple boots (update/firstOrCreate-only, no
        # Tournament::create()) — they're here because
        # CompletedMensBasketballFinalsSeeder/ShowdownSeeder need 40 distinct
        # male players with gender already set to succeed, which an
        # environment whose accounts predate the gender feature (or was
        # restored from a dump taken before it) won't have yet.
        php artisan db:seed --class=GenderBackfillSeeder --force || echo "GenderBackfillSeeder failed — continuing boot anyway"
        php artisan db:seed --class=MalePlayerTopUpSeeder --force || echo "MalePlayerTopUpSeeder failed — continuing boot anyway"

        php artisan db:seed --class=CompletedMensBasketballFinalsSeeder --force || echo "CompletedMensBasketballFinalsSeeder failed — continuing boot anyway"
        php artisan db:seed --class=CompletedMensBasketballShowdownSeeder --force || echo "CompletedMensBasketballShowdownSeeder failed — continuing boot anyway"
    fi

    # Unlike every other flag in this block, DetailedMatchHistoryBackfillSeeder
    # IS safe to leave set across multiple boots — it skips any match that
    # already has a stat sheet + event log (see its own doc comment), so
    # re-running it is always a no-op for matches it already filled in.
    # Separate flag from SEED_BASKETBALL_FORMATS_ON_BOOT above since this one
    # sweeps every sport's completed matches, not just basketball's.
    if [ "$SEED_MATCH_HISTORY_ON_BOOT" = "true" ]; then
        php artisan db:seed --class=DetailedMatchHistoryBackfillSeeder --force || echo "DetailedMatchHistoryBackfillSeeder failed — continuing boot anyway"
    fi

    # Also safe to leave set — deletes-by-name is naturally idempotent (see
    # the seeder's own doc comment). Exists to clean up after
    # SEED_BASKETBALL_FORMATS_ON_BOOT accidentally getting left/set true
    # across two boots, which duplicates its four non-idempotent
    # tournament seeders.
    if [ "$DEDUPE_SHOWCASE_TOURNAMENTS_ON_BOOT" = "true" ]; then
        php artisan db:seed --class=DedupeShowcaseTournamentsSeeder --force || echo "DedupeShowcaseTournamentsSeeder failed — continuing boot anyway"
    fi
fi

exec "$@"
