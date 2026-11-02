<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('t_invoice_sums', function (Blueprint $table) {
            $table->string('reference_no', 50)->nullable()->after('Invoice_no');
            $table->string('customer_code', 50)->nullable()->after('Invoice_date');
            $table->foreignId('store_id')->nullable()->after('customer_code')->constrained('stores');
            $table->foreignId('salesman_id')->nullable()->after('store_id')->constrained('m_salesmen');
            $table->decimal('card_payment', 15, 2)->default(0)->after('Cash_Pay');
            $table->decimal('advance_applied', 15, 2)->default(0)->after('bank_transfer');
            $table->decimal('paid_amount', 15, 2)->default(0)->after('advance_applied');
            $table->string('payment_status', 20)->default('unpaid')->after('paid_amount');
            $table->string('status', 20)->default('posted')->after('payment_status');
            $table->index(['BC', 'customer_code'], 'idx_sales_customer_bc');
        });

        Schema::table('t_invoice_deils', function (Blueprint $table) {
            $table->string('batch_no', 50)->nullable()->after('Item_description');
            $table->foreignId('store_id')->nullable()->after('batch_no')->constrained('stores');
            $table->json('serial_numbers')->nullable()->after('store_id');
        });

        Schema::table('t_customer_payments', function (Blueprint $table) {
            $table->text('Payment_note')->nullable()->after('Customer_Phone');
        });

        Schema::table('t_advanc_cus_payments', function (Blueprint $table) {
            $table->text('payment_note')->nullable()->after('customer_phone');
            $table->decimal('remaining_amount', 15, 2)->default(0)->after('amount');
            $table->decimal('cash_payment', 15, 2)->default(0)->after('remaining_amount');
            $table->decimal('card_payment', 15, 2)->default(0)->after('cash_payment');
            $table->decimal('cheque_payment', 15, 2)->default(0)->after('card_payment');
            $table->decimal('bank_transfer', 15, 2)->default(0)->after('cheque_payment');
        });

        Schema::create('t_customer_invoice_payments', function (Blueprint $table) {
            $table->id();
            $table->string('payment_no', 50);
            $table->string('sales_invoice_no', 50);
            $table->decimal('amount_allocated', 15, 2);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->foreign('payment_no')->references('Payment_no')->on('t_customer_payments')->cascadeOnDelete();
            $table->foreign('sales_invoice_no')->references('Invoice_no')->on('t_invoice_sums');
            $table->index('sales_invoice_no', 'idx_customer_allocated_invoice');
        });

        Schema::create('t_customer_advance_allocations', function (Blueprint $table) {
            $table->id();
            $table->string('advance_payment_no', 50);
            $table->string('sales_invoice_no', 50);
            $table->decimal('amount_allocated', 15, 2);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->foreign('advance_payment_no')->references('payment_no')->on('t_advanc_cus_payments');
            $table->foreign('sales_invoice_no')->references('Invoice_no')->on('t_invoice_sums');
            $table->index('sales_invoice_no', 'idx_advance_allocated_invoice');
        });

        Schema::create('t_customer_account_trances', function (Blueprint $table) {
            $table->id();
            $table->string('no', 50);
            $table->string('customer_code', 50);
            $table->decimal('dr_amount', 15, 2)->default(0);
            $table->decimal('cr_amount', 15, 2)->default(0);
            $table->string('trance_type', 30);
            $table->string('trance_no', 50);
            $table->date('dDate');
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index(['BC', 'dDate'], 'idx_customer_ledger_bc');
            $table->index('customer_code', 'idx_customer_ledger_customer');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('t_customer_account_trances');
        Schema::dropIfExists('t_customer_advance_allocations');
        Schema::dropIfExists('t_customer_invoice_payments');

        Schema::table('t_advanc_cus_payments', function (Blueprint $table) {
            $table->dropColumn([
                'payment_note',
                'remaining_amount',
                'cash_payment',
                'card_payment',
                'cheque_payment',
                'bank_transfer',
            ]);
        });

        Schema::table('t_customer_payments', function (Blueprint $table) {
            $table->dropColumn('Payment_note');
        });

        Schema::table('t_invoice_deils', function (Blueprint $table) {
            $table->dropConstrainedForeignId('store_id');
            $table->dropColumn(['batch_no', 'serial_numbers']);
        });

        Schema::table('t_invoice_sums', function (Blueprint $table) {
            $table->dropIndex('idx_sales_customer_bc');
            $table->dropConstrainedForeignId('salesman_id');
            $table->dropConstrainedForeignId('store_id');
            $table->dropColumn([
                'reference_no',
                'customer_code',
                'card_payment',
                'advance_applied',
                'paid_amount',
                'payment_status',
                'status',
            ]);
        });
    }
};
