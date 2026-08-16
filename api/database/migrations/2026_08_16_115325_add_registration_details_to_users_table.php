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
        Schema::table('users', function (Blueprint $table) {
            // Nullable at the DB level so existing accounts (seeded demo
            // users, anything created before this migration) stay valid —
            // the registration form is what actually requires these, via
            // validation, not the schema.
            $table->string('first_name')->nullable()->after('name');
            $table->string('middle_name')->nullable()->after('first_name');
            $table->string('last_name')->nullable()->after('middle_name');
            $table->date('birthday')->nullable()->after('last_name');
            $table->string('address')->nullable()->after('birthday');
            // A registrant's proof of address (a valid ID or a billing
            // statement) and, only for coach registrants, proof of
            // eligibility to coach players.
            $table->string('proof_of_address_path')->nullable()->after('cover_path');
            $table->string('coach_eligibility_proof_path')->nullable()->after('proof_of_address_path');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'first_name',
                'middle_name',
                'last_name',
                'birthday',
                'address',
                'proof_of_address_path',
                'coach_eligibility_proof_path',
            ]);
        });
    }
};
