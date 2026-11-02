<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 8. HIRE PURCHASE
        Schema::create('t_hire_purchase_sums', function (Blueprint $table) {
            $table->id();
            $table->string('invoice_no', 50)->unique();
            $table->string('reference_no', 50)->nullable();
            $table->string('agreement_no', 100)->unique();
            $table->date('invoice_date');
            $table->string('customer_code', 50);
            $table->string('customer_name', 100)->nullable();
            $table->string('customer_nic', 15);
            $table->string('customer_phone', 15)->nullable();
            $table->text('customer_address')->nullable();
            $table->string('guarantor_1_code', 50)->nullable();
            $table->string('guarantor_2_code', 50)->nullable();
            $table->string('schema_type', 50);
            $table->decimal('document_charge_rate', 5, 2);
            $table->decimal('document_charge', 15, 2);
            $table->decimal('down_payment_rate', 5, 2);
            $table->decimal('down_payment', 15, 2);
            $table->decimal('transport', 15, 2)->default(0);
            $table->decimal('instalment_rate', 5, 2);
            $table->decimal('instalment_amount', 15, 2);
            $table->integer('no_of_instalment');
            $table->integer('instalment_due_date');
            $table->decimal('instalment', 15, 2);
            $table->decimal('due_amount', 15, 2);
            $table->decimal('gross_amount', 15, 2);
            $table->decimal('discount', 15, 2)->default(0);
            $table->decimal('net_amount', 15, 2);
            $table->boolean('is_cash_converted')->default(false);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('schema_type')->references('SchemaType')->on('m_schemas');
            $table->index('agreement_no', 'idx_hp_agreement');
            $table->index(['BC', 'invoice_date'], 'idx_hp_bc_date');
        });

        Schema::create('t_hire_purchase_details', function (Blueprint $table) {
            $table->id();
            $table->string('invoice_no', 50);
            $table->date('invoice_date');
            $table->string('item_code', 50);
            $table->string('Item_s_code', 50)->nullable();
            $table->string('item_description', 200)->nullable();
            $table->integer('qty');
            $table->decimal('unit_price', 15, 2);
            $table->decimal('discount_precentage', 5, 2)->default(0);
            $table->decimal('discount', 15, 2)->default(0);
            $table->decimal('net_value', 15, 2);
            $table->boolean('is_cash_converted')->default(false);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->foreign('invoice_no')->references('invoice_no')->on('t_hire_purchase_sums')->cascadeOnDelete();
        });

        Schema::create('t_instalments', function (Blueprint $table) {
            $table->id();
            $table->string('invoice_no', 50);
            $table->string('agreement_no', 100);
            $table->date('invoice_date');
            $table->string('customer_code', 50);
            $table->string('customer_name', 100)->nullable();
            $table->date('instalment_date');
            $table->decimal('instalment_amount', 15, 2);
            $table->decimal('instalment', 15, 2);
            $table->decimal('amount_pay', 15, 2)->default(0);
            $table->date('up_date')->nullable();
            $table->decimal('cash_payment', 15, 2)->default(0);
            $table->decimal('card_payment', 15, 2)->default(0);
            $table->decimal('cheque_payment', 15, 2)->default(0);
            $table->decimal('bank_transfer', 15, 2)->default(0);
            $table->decimal('discount', 15, 2)->default(0);
            $table->decimal('penalty_amount', 15, 2)->default(0);
            $table->decimal('penalty_total_amount', 15, 2)->default(0);
            $table->boolean('is_waived')->default(false);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('invoice_no')->references('invoice_no')->on('t_hire_purchase_sums')->cascadeOnDelete();
            $table->index('instalment_date', 'idx_instalment_date');
            $table->index('agreement_no', 'idx_instalment_agreement');
            $table->index('BC', 'idx_instalment_bc');
        });

        Schema::create('t_hire_purchase_to_sales', function (Blueprint $table) {
            $table->id();
            $table->string('conversion_no', 50)->unique();
            $table->date('conversion_date');
            $table->string('invoice_no', 50);
            $table->string('agreement_no', 100);
            $table->date('invoice_date');
            $table->decimal('installment_pad_total', 15, 2)->default(0);
            $table->string('customer_nic', 15);
            $table->string('customer_name', 100)->nullable();
            $table->string('customer_phone', 15)->nullable();
            $table->decimal('item_net_amount', 15, 2);
            $table->decimal('down_payment', 15, 2);
            $table->decimal('transport', 15, 2)->default(0);
            $table->decimal('total_instalment_amount', 15, 2);
            $table->decimal('due_amount_as_discount', 15, 2)->default(0);
            $table->decimal('discount', 15, 2)->default(0);
            $table->decimal('Document_Charge', 15, 2)->default(0);
            $table->decimal('amount', 15, 2);
            $table->decimal('cash_payment', 15, 2)->default(0);
            $table->decimal('card_payment', 15, 2)->default(0);
            $table->decimal('cheque_payment', 15, 2)->default(0);
            $table->decimal('bank_transfer', 15, 2)->default(0);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('invoice_no')->references('invoice_no')->on('t_hire_purchase_sums');
        });

        Schema::create('t_hire_purchase_return_sums', function (Blueprint $table) {
            $table->id();
            $table->string('hpreturn_code', 50);
            $table->string('invoice_no', 50);
            $table->string('agreement_no', 100);
            $table->string('customer_nic', 15);
            $table->decimal('gross_amount', 15, 2);
            $table->decimal('net_amount', 15, 2);
            $table->string('bc', 10);
            $table->string('oc', 50);
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('t_hire_purchase_return_details', function (Blueprint $table) {
            $table->id();
            $table->string('hpreturn_code', 50);
            $table->string('item_code', 50);
            $table->integer('qty');
            $table->decimal('unit_price', 15, 2);
            $table->decimal('net_value', 15, 2);
            $table->string('bc', 10);
            $table->string('oc', 50);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('t_hire_purchase_return_details');
        Schema::dropIfExists('t_hire_purchase_return_sums');
        Schema::dropIfExists('t_hire_purchase_to_sales');
        Schema::dropIfExists('t_instalments');
        Schema::dropIfExists('t_hire_purchase_details');
        Schema::dropIfExists('t_hire_purchase_sums');
    }
};
