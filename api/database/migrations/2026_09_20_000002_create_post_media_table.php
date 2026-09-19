<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('post_media', function (Blueprint $table) {
            $table->id();
            $table->foreignId('post_id')->constrained()->cascadeOnDelete();
            $table->string('path');
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();

            $table->index(['post_id', 'position']);
        });

        // Every existing post has exactly one image on the (about to be
        // dropped — see the sibling migration) posts.image_path column.
        // Carry each one over as that post's sole, position-0 media row so
        // nothing already posted loses its photo.
        DB::table('posts')->whereNotNull('image_path')->orderBy('id')->get(['id', 'image_path', 'created_at'])
            ->each(function ($post) {
                DB::table('post_media')->insert([
                    'post_id' => $post->id,
                    'path' => $post->image_path,
                    'position' => 0,
                    'created_at' => $post->created_at,
                    'updated_at' => $post->created_at,
                ]);
            });
    }

    public function down(): void
    {
        Schema::dropIfExists('post_media');
    }
};
