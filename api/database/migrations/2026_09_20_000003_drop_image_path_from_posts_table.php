<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Superseded by post_media (see the sibling migration, which
        // already carried every existing post's single image over there
        // before this runs) — a post can now carry 2+ images.
        Schema::table('posts', function (Blueprint $table) {
            $table->dropColumn('image_path');
        });
    }

    public function down(): void
    {
        Schema::table('posts', function (Blueprint $table) {
            // Not a lossless rollback — a post that had picked up a SECOND
            // image while this column was gone has nowhere for that image
            // to go back to; only ever meant to undo this migration
            // immediately after running it, not after real use.
            $table->string('image_path')->nullable();
        });
    }
};
