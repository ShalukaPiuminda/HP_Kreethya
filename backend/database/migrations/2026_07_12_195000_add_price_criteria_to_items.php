<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->decimal('min_sales_price', 15, 2)
                ->nullable()
                ->after('max_sales_qty');
            $table->decimal('max_sales_price', 15, 2)
                ->nullable()
                ->after('min_sales_price');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn(['min_sales_price', 'max_sales_price']);
        });
    }
};
