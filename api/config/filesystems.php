<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default Filesystem Disk
    |--------------------------------------------------------------------------
    |
    | Here you may specify the default filesystem disk that should be used
    | by the framework. The "local" disk, as well as a variety of cloud
    | based disks are available to your application for file storage.
    |
    */

    'default' => env('FILESYSTEM_DISK', 'local'),

    /*
    |--------------------------------------------------------------------------
    | Filesystem Disks
    |--------------------------------------------------------------------------
    |
    | Below you may configure as many filesystem disks as necessary, and you
    | may even configure multiple disks for the same driver. Examples for
    | most supported storage drivers are configured here for reference.
    |
    | Supported drivers: "local", "ftp", "sftp", "s3"
    |
    */

    'disks' => [

        'local' => [
            'driver' => 'local',
            'root' => storage_path('app/private'),
            'serve' => true,
            'throw' => false,
            'report' => false,
        ],

        // Render's web-service disk is ephemeral — anything written to
        // storage/app/public at runtime (post images, news covers, avatars)
        // is wiped on every deploy/restart. In production FILESYSTEM_PUBLIC_DRIVER
        // is set to "s3" (pointed at a Backblaze B2 bucket via the AWS_*
        // vars below — B2 speaks the S3 API; used instead of Cloudflare R2
        // specifically because R2 requires a card on file even for its free
        // tier) so every existing Storage::disk('public') call site in the
        // app keeps working unchanged, just durably. Any other S3-compatible
        // provider works too, with different env values — nothing here is
        // B2-specific. Local dev leaves this unset and keeps writing
        // straight to the local filesystem.
        'public' => [
            'driver' => env('FILESYSTEM_PUBLIC_DRIVER', 'local'),
            // Laravel wraps EVERY disk's adapter in a path-prefixer built
            // from 'root', regardless of driver — so leaving this set to the
            // container's local filesystem path while driver=s3 silently
            // prefixed every uploaded object's key with the literal string
            // "var/www/html/storage/app/public/..." inside the bucket, and
            // broke every url() call the same way (confirmed by hand: a real
            // upload failed and the returned image_url had that whole local
            // path baked into it). Only the local driver has a real
            // filesystem root to prefix; s3 has none.
            'root' => env('FILESYSTEM_PUBLIC_DRIVER', 'local') === 'local' ? storage_path('app/public') : '',
            'url' => env('FILESYSTEM_PUBLIC_URL', rtrim(env('APP_URL', 'http://localhost'), '/').'/storage'),
            'visibility' => 'public',
            'throw' => false,
            'report' => false,
            'key' => env('AWS_ACCESS_KEY_ID'),
            'secret' => env('AWS_SECRET_ACCESS_KEY'),
            'region' => env('AWS_DEFAULT_REGION'),
            'bucket' => env('AWS_BUCKET'),
            'endpoint' => env('AWS_ENDPOINT'),
            'use_path_style_endpoint' => env('AWS_USE_PATH_STYLE_ENDPOINT', true),
        ],

        's3' => [
            'driver' => 's3',
            'key' => env('AWS_ACCESS_KEY_ID'),
            'secret' => env('AWS_SECRET_ACCESS_KEY'),
            'region' => env('AWS_DEFAULT_REGION'),
            'bucket' => env('AWS_BUCKET'),
            'url' => env('AWS_URL'),
            'endpoint' => env('AWS_ENDPOINT'),
            'use_path_style_endpoint' => env('AWS_USE_PATH_STYLE_ENDPOINT', false),
            'throw' => false,
            'report' => false,
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Symbolic Links
    |--------------------------------------------------------------------------
    |
    | Here you may configure the symbolic links that will be created when the
    | `storage:link` Artisan command is executed. The array keys should be
    | the locations of the links and the values should be their targets.
    |
    */

    'links' => [
        public_path('storage') => storage_path('app/public'),
    ],

];
