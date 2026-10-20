<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('t_cus_cheques', function (Blueprint $table) {
            $table->foreignId('source_bank_detail_id')->nullable()->after('trans_type')->constrained('bank_details');
            $table->foreignId('source_bank_branch_id')->nullable()->after('source_bank_detail_id')->constrained('bank_branches');
        });

        Schema::table('t_sup_cheques', function (Blueprint $table) {
            $table->foreignId('source_bank_detail_id')->nullable()->after('trans_type')->constrained('bank_details');
            $table->foreignId('source_bank_branch_id')->nullable()->after('source_bank_detail_id')->constrained('bank_branches');
        });

        Schema::table('t_hire_purchase_sums', function (Blueprint $table) {
            $table->decimal('advance_applied', 15, 2)->default(0)->after('down_payment');
            $table->decimal('down_payment_outstanding', 15, 2)->default(0)->after('advance_applied');
        });

        Schema::create('t_customer_hp_advance_allocations', function (Blueprint $table) {
            $table->id();
            $table->string('advance_payment_no', 50);
            $table->string('hp_invoice_no', 50);
            $table->decimal('amount_allocated', 15, 2);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->foreign('advance_payment_no')->references('payment_no')->on('t_advanc_cus_payments');
            $table->foreign('hp_invoice_no')->references('invoice_no')->on('t_hire_purchase_sums');
            $table->index('hp_invoice_no', 'idx_hp_advance_invoice');
        });

        Schema::table('t_hp_installment_payments', function (Blueprint $table) {
            $table->string('collection_no', 50)->nullable()->after('payment_no');
            $table->string('status', 20)->default('posted')->after('note');
            $table->timestamp('returned_at')->nullable()->after('status');
            $table->text('return_reason')->nullable()->after('returned_at');
            $table->index(['BC', 'collection_no'], 'idx_hp_payment_collection');
        });

        Schema::table('t_hire_purchase_to_sales', function (Blueprint $table) {
            $table->string('status', 20)->default('posted')->after('conversion_note');
            $table->timestamp('returned_at')->nullable()->after('status');
            $table->text('return_reason')->nullable()->after('returned_at');
        });
    }

    public function down(): void
    {
        Schema::table('t_hire_purchase_to_sales', function (Blueprint $table) {
            $table->dropColumn(['status', 'returned_at', 'return_reason']);
        });

        Schema::table('t_hp_installment_payments', function (Blueprint $table) {
            $table->dropIndex('idx_hp_payment_collection');
            $table->dropColumn(['collection_no', 'status', 'returned_at', 'return_reason']);
        });

        Schema::dropIfExists('t_customer_hp_advance_allocations');

        Schema::table('t_hire_purchase_sums', function (Blueprint $table) {
            $table->dropColumn(['advance_applied', 'down_payment_outstanding']);
        });

        Schema::table('t_sup_cheques', function (Blueprint $table) {
            $table->dropConstrainedForeignId('source_bank_branch_id');
            $table->dropConstrainedForeignId('source_bank_detail_id');
        });

        Schema::table('t_cus_cheques', function (Blueprint $table) {
            $table->dropConstrainedForeignId('source_bank_branch_id');
            $table->dropConstrainedForeignId('source_bank_detail_id');
        });
    }
};
