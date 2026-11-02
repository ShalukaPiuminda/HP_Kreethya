<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 5. STOCK MOVEMENT LOGS
        Schema::create('t_item_movements', function (Blueprint $table) {
            $table->id();
            $table->string('trans_no', 50);
            $table->date('dDate');
            $table->string('trans_code', 20);
            $table->string('item_code', 50);
            $table->string('batch_no', 50)->nullable();
            $table->foreignId('store_id')->constrained();
            $table->integer('qun_in')->default(0);
            $table->integer('qun_out')->default(0);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('item_code')->references('item_code')->on('items');
            $table->index(['trans_no', 'trans_code'], 'idx_movement_trans');
            $table->index(['item_code', 'store_id'], 'idx_movement_item_store');
            $table->index(['BC', 'dDate'], 'idx_movement_bc_date');
        });

        Schema::create('t_item_serial_movements', function (Blueprint $table) {
            $table->id();
            $table->string('trans_no', 50);
            $table->string('trans_code', 20);
            $table->string('item_code', 50);
            $table->string('item_description', 200)->nullable();
            $table->string('item_serial_no', 100);
            $table->integer('qun_in')->default(0);
            $table->integer('qun_out')->default(0);
            $table->foreignId('store_id')->constrained();
            $table->date('dDate');
            $table->string('bc', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('item_code')->references('item_code')->on('items');
            $table->index('item_serial_no', 'idx_serial_no');
            $table->index(['trans_no', 'trans_code'], 'idx_serial_trans');
        });

        // 6. PURCHASES
        Schema::create('t_purchase_order_sums', function (Blueprint $table) {
            $table->id();
            $table->string('po_no', 50)->unique();
            $table->date('po_date');
            $table->string('supplier_code', 50);
            $table->decimal('gross_amount', 15, 2);
            $table->decimal('net_amount', 15, 2);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index(['BC', 'po_date'], 'idx_po_bc_date');
        });

        Schema::create('t_purchases_order_details', function (Blueprint $table) {
            $table->id();
            $table->string('po_no', 50);
            $table->string('item_code', 50);
            $table->integer('qty');
            $table->decimal('unit_price', 15, 2);
            $table->decimal('net_value', 15, 2);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->foreign('po_no')->references('po_no')->on('t_purchase_order_sums')->cascadeOnDelete();
        });

        Schema::create('t_purchases_sums', function (Blueprint $table) {
            $table->id();
            $table->string('Invoice_no', 50)->unique();
            $table->string('Ref_no', 50)->nullable();
            $table->date('Invoice_date');
            $table->string('Customer_NIC', 50);
            $table->string('Customer_Name', 100)->nullable();
            $table->string('Customer_Phone', 15)->nullable();
            $table->decimal('Gross_Amount', 15, 2);
            $table->decimal('Discount', 15, 2)->default(0);
            $table->decimal('Net_Amount', 15, 2);
            $table->decimal('cash_payment', 15, 2)->default(0);
            $table->decimal('credit_payment', 15, 2)->default(0);
            $table->decimal('cheque_payment', 15, 2)->default(0);
            $table->decimal('paid_amount', 15, 2)->default(0);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index('Invoice_no', 'idx_purchase_invoice');
            $table->index(['BC', 'Invoice_date'], 'idx_purchase_bc_date');
        });

        Schema::create('t_purchases_details', function (Blueprint $table) {
            $table->id();
            $table->string('Invoice_no', 50);
            $table->string('Ref_no', 50)->nullable();
            $table->date('Invoice_date');
            $table->string('Item_code', 50);
            $table->string('Item_s_code', 50)->nullable();
            $table->string('Item_description', 200)->nullable();
            $table->string('batch_no', 50)->nullable();
            $table->integer('QTY');
            $table->decimal('Unit_price', 15, 2);
            $table->decimal('Discount', 15, 2)->default(0);
            $table->decimal('Net_value', 15, 2);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->foreign('Invoice_no')->references('Invoice_no')->on('t_purchases_sums')->cascadeOnDelete();
        });

        Schema::create('t_supplier_payments', function (Blueprint $table) {
            $table->id();
            $table->string('Payment_no', 50)->unique();
            $table->date('Payment_date');
            $table->string('Supplier_Code', 50);
            $table->string('Supplier_Name', 100)->nullable();
            $table->string('Supplier_Phone', 15)->nullable();
            $table->text('Payment_note')->nullable();
            $table->decimal('Payment_Amount', 15, 2);
            $table->decimal('cash_payment', 15, 2)->default(0);
            $table->decimal('card_payment', 15, 2)->default(0);
            $table->decimal('cheque_payment', 15, 2)->default(0);
            $table->decimal('bank_transfer', 15, 2)->default(0);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index(['BC', 'Payment_date'], 'idx_supplier_payment_bc');
        });

        Schema::create('t_supplier_invoice_payments', function (Blueprint $table) {
            $table->id();
            $table->string('payment_no', 50);
            $table->string('purchase_invoice_no', 50);
            $table->decimal('amount_allocated', 15, 2);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->foreign('payment_no')->references('Payment_no')->on('t_supplier_payments')->cascadeOnDelete();
            $table->foreign('purchase_invoice_no')->references('Invoice_no')->on('t_purchases_sums');
            $table->index('purchase_invoice_no', 'idx_supplier_allocated_inv');
        });

        Schema::create('t_sup_cheques', function (Blueprint $table) {
            $table->id();
            $table->string('trans_no', 50);
            $table->string('trans_type', 20);
            $table->string('bank', 100);
            $table->string('branch_code', 20);
            $table->string('cheques_no', 50);
            $table->string('acc_no', 50);
            $table->date('release_date');
            $table->decimal('amount', 15, 2);
            $table->enum('status', ['pending', 'passed', 'returned'])->default('pending');
            $table->date('realized_date')->nullable();
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index('cheques_no', 'idx_sup_cheque_no');
            $table->index('BC', 'idx_sup_chq_bc');
        });

        Schema::create('t_sup_purchase_trances', function (Blueprint $table) {
            $table->id();
            $table->string('no', 50);
            $table->string('supplier', 50);
            $table->string('dr_trnce_code', 20);
            $table->string('dr_trnce_no', 50);
            $table->decimal('dr_amount', 15, 2)->default(0);
            $table->string('cr_trnce_code', 20);
            $table->string('cr_trnce_no', 50);
            $table->decimal('cr_amount', 15, 2)->default(0);
            $table->string('trance_type', 20);
            $table->string('trance_no', 50);
            $table->date('dDate');
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index(['BC', 'dDate'], 'idx_sup_ledger_bc');
            $table->index('supplier', 'idx_sup_ledger_supplier');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('t_sup_purchase_trances');
        Schema::dropIfExists('t_sup_cheques');
        Schema::dropIfExists('t_supplier_invoice_payments');
        Schema::dropIfExists('t_supplier_payments');
        Schema::dropIfExists('t_purchases_details');
        Schema::dropIfExists('t_purchases_sums');
        Schema::dropIfExists('t_purchases_order_details');
        Schema::dropIfExists('t_purchase_order_sums');
        Schema::dropIfExists('t_item_serial_movements');
        Schema::dropIfExists('t_item_movements');
    }
};
