<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        // Submitted anonymously from the landing page's contact section — no
        // user_id, since the visitor isn't necessarily (or even usually) a
        // registered account. The admin replies over real email (see
        // PublicInquiryMail's reply-to), so the inquirer's own email is the
        // only way back to them; it's required, not a nullable convenience.
        Schema::create('public_inquiries', function (Blueprint $table) {
            $table->id();
            $table->string('name')->nullable();
            $table->string('email');
            $table->string('topic');
            $table->text('message');
            $table->timestamps();

            $table->index('created_at');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('public_inquiries');
    }
};
