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

    # Opt-in, one-shot seeding hook — the free plan also can't run
    # `render jobs create` ("new paid services not allowed"), so this is the
    # only way to run a one-off artisan command at all on it. Every seeder
    # in this codebase is firstOrCreate/findOrCreate-based, so leaving this
    # flag set across multiple boots is harmless, not just a one-time
    # allowance. Unset SEED_ON_BOOT (or leave it unset) once seeding is done
    # so ordinary restarts don't pay the extra query cost.
    if [ "$SEED_ON_BOOT" = "true" ]; then
        php artisan db:seed --force
    fi
fi

exec "$@"
