<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 7. SALES
        Schema::create('t_invoice_sums', function (Blueprint $table) {
            $table->id();
            $table->string('Invoice_no', 50)->unique();
            $table->date('Invoice_date');
            $table->string('Customer_NIC', 15);
            $table->string('Customer_Name', 100)->nullable();
            $table->string('Customer_Phone', 15)->nullable();
            $table->text('Customer_Address')->nullable();
            $table->decimal('Gross_Amount', 15, 2);
            $table->decimal('Discount', 15, 2)->default(0);
            $table->decimal('Net_Amount', 15, 2);
            $table->decimal('Cash_Pay', 15, 2)->default(0);
            $table->decimal('Credite', 15, 2)->default(0);
            $table->decimal('Cheque', 15, 2)->default(0);
            $table->decimal('bank_transfer', 15, 2)->default(0);
            $table->text('serial_number')->nullable();
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index('Invoice_no', 'idx_sales_invoice');
            $table->index(['BC', 'Invoice_date'], 'idx_sales_bc_date');
        });

        Schema::create('t_invoice_deils', function (Blueprint $table) {
            $table->id();
            $table->string('Invoice_no', 50);
            $table->date('Invoice_date');
            $table->string('Item_code', 50);
            $table->string('Item_s_code', 50)->nullable();
            $table->string('Item_description', 200)->nullable();
            $table->integer('QTY');
            $table->decimal('Unit_price', 15, 2);
            $table->decimal('Discount', 15, 2)->default(0);
            $table->decimal('Net_value', 15, 2);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->foreign('Invoice_no')->references('Invoice_no')->on('t_invoice_sums')->cascadeOnDelete();
        });

        Schema::create('t_advanc_cus_payments', function (Blueprint $table) {
            $table->id();
            $table->string('payment_no', 50)->unique();
            $table->date('payment_date');
            $table->string('customer_nic', 15);
            $table->string('customer_name', 100)->nullable();
            $table->string('customer_phone', 15)->nullable();
            $table->decimal('amount', 15, 2);
            $table->boolean('is_carried_forward')->default(false);
            $table->string('carried_forward_invoice_no', 50)->nullable();
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index('customer_nic', 'idx_advance_cus_nic');
            $table->index('BC', 'idx_advance_bc');
        });

        Schema::create('t_sales_return_sums', function (Blueprint $table) {
            $table->id();
            $table->string('return_no', 50)->unique();
            $table->date('return_date');
            $table->string('invoice_no', 50);
            $table->string('customer_nic', 15);
            $table->foreignId('reason_id')->constrained('sales_return_reasons');
            $table->decimal('gross_amount', 15, 2);
            $table->decimal('net_amount', 15, 2);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index('BC', 'idx_sales_return_bc');
        });

        Schema::create('t_sales_return_details', function (Blueprint $table) {
            $table->id();
            $table->string('return_no', 50);
            $table->string('item_code', 50);
            $table->integer('qty');
            $table->decimal('unit_price', 15, 2);
            $table->decimal('net_value', 15, 2);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->foreign('return_no')->references('return_no')->on('t_sales_return_sums')->cascadeOnDelete();
        });

        Schema::create('t_customer_payments', function (Blueprint $table) {
            $table->id();
            $table->string('Payment_no', 50)->unique();
            $table->date('Payment_date');
            $table->string('Customer_NIC', 15);
            $table->string('Customer_Name', 100)->nullable();
            $table->string('Customer_Phone', 15)->nullable();
            $table->decimal('Payment_Amount', 15, 2);
            $table->decimal('cash_payment', 15, 2)->default(0);
            $table->decimal('card_payment', 15, 2)->default(0);
            $table->decimal('cheque_payment', 15, 2)->default(0);
            $table->decimal('bank_transfer', 15, 2)->default(0);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index(['BC', 'Payment_date'], 'idx_customer_payment_bc');
        });

        Schema::create('t_cus_cheques', function (Blueprint $table) {
            $table->id();
            $table->string('trans_no', 50);
            $table->string('trans_type', 20);
            $table->string('bank', 100);
            $table->string('branch_code', 20);
            $table->string('cheques_no', 50);
            $table->string('acc_no', 50);
            $table->date('due_date');
            $table->decimal('amount', 15, 2);
            $table->enum('status', ['pending', 'passed', 'returned'])->default('pending');
            $table->date('realized_date')->nullable();
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index('cheques_no', 'idx_cus_cheque_no');
            $table->index('BC', 'idx_cus_chq_bc');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('t_cus_cheques');
        Schema::dropIfExists('t_customer_payments');
        Schema::dropIfExists('t_sales_return_details');
        Schema::dropIfExists('t_sales_return_sums');
        Schema::dropIfExists('t_advanc_cus_payments');
        Schema::dropIfExists('t_invoice_deils');
        Schema::dropIfExists('t_invoice_sums');
    }
};
