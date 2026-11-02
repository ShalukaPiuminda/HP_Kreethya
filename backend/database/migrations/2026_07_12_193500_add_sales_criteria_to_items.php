<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->boolean('sales_criteria_enabled')
                ->default(false)
                ->after('reorder_level');
            $table->integer('min_sales_qty')
                ->nullable()
                ->after('sales_criteria_enabled');
            $table->integer('max_sales_qty')
                ->nullable()
                ->after('min_sales_qty');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn([
                'sales_criteria_enabled',
                'min_sales_qty',
                'max_sales_qty',
            ]);
        });
    }
};

