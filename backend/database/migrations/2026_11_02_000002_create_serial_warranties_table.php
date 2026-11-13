<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One row per warranted serial unit. Warranty periods are snapshotted so later
        // item master changes do not alter warranties already given.
        Schema::create('serial_warranties', function (Blueprint $table) {
            $table->id();
            $table->string('item_code', 50);
            $table->string('item_serial_no', 100);

            $table->string('grn_no', 50)->nullable();
            $table->date('grn_date')->nullable();
            $table->string('supplier_code', 50)->nullable();
            $table->unsignedInteger('supplier_warranty_period')->nullable();
            $table->string('supplier_warranty_unit', 10)->nullable();
            $table->date('supplier_warranty_expiry')->nullable();

            $table->string('sale_type', 10)->nullable();
            $table->string('sale_no', 50)->nullable();
            $table->date('sale_date')->nullable();
            $table->string('customer_code', 50)->nullable();
            $table->string('customer_name', 150)->nullable();
            $table->string('customer_phone', 50)->nullable();
            $table->unsignedInteger('warranty_period')->nullable();
            $table->string('warranty_unit', 10)->nullable();
            $table->date('customer_warranty_expiry')->nullable();

            $table->string('status', 20)->default('in_stock');
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamps();

            $table->unique(['BC', 'item_code', 'item_serial_no'], 'idx_serial_warranty_unit');
            $table->index(['BC', 'item_serial_no'], 'idx_serial_warranty_serial');
            $table->index(['BC', 'sale_no'], 'idx_serial_warranty_sale');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('serial_warranties');
    }
};
