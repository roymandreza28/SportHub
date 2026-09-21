# Single image shared by two Railway services (see railway.web.json and
# railway.reverb.json): the "web" service runs the default CMD below
# (nginx + php-fpm via supervisord), the "reverb" service overrides the start
# command to `php artisan reverb:start` instead. Building both from one image
# keeps the vendor/autoload state identical between the HTTP app and the
# WebSocket server, which matters since they share the same broadcast event
# classes.

FROM composer:2 AS vendor

WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction

COPY . .
RUN composer dump-autoload --optimize --classmap-authoritative

FROM php:8.3-fpm-alpine

# freetype/libjpeg-turbo/libpng (the RUNTIME libraries, not just their -dev
# headers) are listed explicitly here so apk's world file marks them as
# wanted on their own — otherwise apk pulls them in only as transitive deps
# of the -dev packages, and `apk del *-dev` below removes them right along
# with the headers. Confirmed the hard way: an earlier version of this
# Dockerfile without this line built fine, but every PHP process at runtime
# logged "PHP Startup: Unable to load dynamic library 'gd'... Error loading
# shared library libjpeg.so.8: No such file or directory" — gd.so was
# present but its own runtime dependency had been deleted.
RUN apk add --no-cache \
        nginx \
        supervisor \
        gettext \
        postgresql-dev \
        oniguruma-dev \
        freetype \
        libjpeg-turbo \
        libpng \
        freetype-dev \
        libjpeg-turbo-dev \
        libpng-dev \
        font-dejavu \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j$(nproc) \
        pdo_pgsql \
        pgsql \
        bcmath \
        pcntl \
        opcache \
        mbstring \
        gd \
    && apk del oniguruma-dev freetype-dev libjpeg-turbo-dev libpng-dev

WORKDIR /var/www/html
COPY --from=vendor /app ./

# .dockerignore excludes storage/framework/*'s contents (including its
# .gitignore placeholders), so recreate the directories Laravel expects to
# exist and be writable at runtime rather than relying on COPY to preserve
# otherwise-empty directories.
#
# chmod alongside chown, not just chown: the actual permission bits here
# otherwise come from whatever mode storage/ had in the build context at
# COPY time (line 54/15 above) — fine from a Linux git checkout (Render, or
# GitHub Actions' own `railway up`), but a local `railway up` from a Windows
# machine packaged these directories with no write bit at all, since NTFS
# has no real POSIX permission bits to preserve. www-data (the user php-fpm
# actually runs requests as) then can't write logs/cache/sessions and every
# request 500s. The explicit chmod makes this deterministic regardless of
# which OS the build was triggered from.
RUN mkdir -p storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs \
    && chown -R www-data:www-data /var/www/html/storage /var/www/html/bootstrap/cache \
    && chmod -R u+rwX,g+rwX /var/www/html/storage /var/www/html/bootstrap/cache

COPY docker/nginx.conf.template /etc/nginx/nginx.conf.template
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
CMD ["supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
