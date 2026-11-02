<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('t_purchase_order_sums', function (Blueprint $table) {
            $table->string('status', 30)->default('draft')->after('net_amount');
            $table->date('expected_date')->nullable()->after('po_date');
            $table->text('notes')->nullable()->after('status');
        });

        Schema::table('t_purchases_order_details', function (Blueprint $table) {
            $table->string('item_description', 200)->nullable()->after('item_code');
            $table->integer('received_qty')->default(0)->after('qty');
        });

        Schema::table('t_purchases_sums', function (Blueprint $table) {
            $table->string('supplier_code', 50)->nullable()->after('Invoice_date');
            $table->string('purchase_order_no', 50)->nullable()->after('supplier_code');
            $table->foreignId('store_id')->nullable()->after('purchase_order_no')->constrained('stores');
            $table->string('payment_status', 20)->default('unpaid')->after('paid_amount');
            $table->index(['BC', 'supplier_code'], 'idx_purchase_supplier_bc');
        });

        Schema::table('t_purchases_details', function (Blueprint $table) {
            $table->foreignId('store_id')->nullable()->after('batch_no')->constrained('stores');
            $table->decimal('Sales_price', 15, 2)->default(0)->after('Unit_price');
            $table->json('serial_numbers')->nullable()->after('Sales_price');
        });
    }

    public function down(): void
    {
        Schema::table('t_purchases_details', function (Blueprint $table) {
            $table->dropConstrainedForeignId('store_id');
            $table->dropColumn(['Sales_price', 'serial_numbers']);
        });

        Schema::table('t_purchases_sums', function (Blueprint $table) {
            $table->dropIndex('idx_purchase_supplier_bc');
            $table->dropConstrainedForeignId('store_id');
            $table->dropColumn([
                'supplier_code',
                'purchase_order_no',
                'payment_status',
            ]);
        });

        Schema::table('t_purchases_order_details', function (Blueprint $table) {
            $table->dropColumn(['item_description', 'received_qty']);
        });

        Schema::table('t_purchase_order_sums', function (Blueprint $table) {
            $table->dropColumn(['status', 'expected_date', 'notes']);
        });
    }
};
