<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('t_purchases_sums', function (Blueprint $table) {
            $table->string('discount_type', 20)
                ->default('amount')
                ->after('Discount');
            $table->decimal('discount_value', 15, 2)
                ->default(0)
                ->after('discount_type');
        });

        Schema::table('t_purchases_details', function (Blueprint $table) {
            $table->string('discount_type', 20)
                ->default('amount')
                ->after('Discount');
            $table->decimal('discount_value', 15, 2)
                ->default(0)
                ->after('discount_type');
        });

        DB::table('t_purchases_sums')->update([
            'discount_type' => 'amount',
            'discount_value' => DB::raw('Discount'),
        ]);

        DB::table('t_purchases_details')->update([
            'discount_type' => 'amount',
            'discount_value' => DB::raw('Discount'),
        ]);
    }

    public function down(): void
    {
        Schema::table('t_purchases_details', function (Blueprint $table) {
            $table->dropColumn(['discount_type', 'discount_value']);
        });

        Schema::table('t_purchases_sums', function (Blueprint $table) {
            $table->dropColumn(['discount_type', 'discount_value']);
        });
    }
};

