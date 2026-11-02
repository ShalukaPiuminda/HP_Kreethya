<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            // Customer warranty runs from the sale date; supplier warranty from the GRN date.
            $table->boolean('has_warranty')->default(false)->after('is_serialized');
            $table->unsignedInteger('warranty_period')->nullable()->after('has_warranty');
            $table->string('warranty_unit', 10)->default('months')->after('warranty_period');
            $table->unsignedInteger('supplier_warranty_period')->nullable()->after('warranty_unit');
            $table->string('supplier_warranty_unit', 10)->default('months')->after('supplier_warranty_period');
            $table->text('warranty_terms')->nullable()->after('supplier_warranty_unit');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropColumn([
                'has_warranty',
                'warranty_period',
                'warranty_unit',
                'supplier_warranty_period',
                'supplier_warranty_unit',
                'warranty_terms',
            ]);
        });
    }
};
