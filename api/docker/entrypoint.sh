#!/bin/sh
set -e

# Railway assigns $PORT at runtime (it differs per deploy), so the nginx
# config can't be static — render it from the template on every boot. This
# runs for both the web and reverb services; it's a no-op cost for reverb
# since that service overrides CMD and never starts nginx.
envsubst '${PORT}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

# Config caching needs to happen after Railway's env vars are actually
# present in the process environment, i.e. at container boot, not at image
# build time. Deliberately not running `route:cache`: routes/api.php has a
# couple of closure-based routes (/user, /players), and route caching can't
# serialize closures — it throws, which would crash the container on boot.
php artisan config:cache

exec "$@"
