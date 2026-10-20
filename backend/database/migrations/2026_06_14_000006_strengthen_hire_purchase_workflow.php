<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('t_hire_purchase_sums', function (Blueprint $table) {
            $table->foreignId('store_id')->nullable()->after('schema_type')->constrained('stores');
            $table->string('status', 30)->default('active')->after('is_cash_converted');
            $table->decimal('contract_amount', 15, 2)->default(0)->after('net_amount');
            $table->decimal('paid_amount', 15, 2)->default(0)->after('contract_amount');
            $table->decimal('outstanding_amount', 15, 2)->default(0)->after('paid_amount');
            $table->decimal('returned_amount', 15, 2)->default(0)->after('outstanding_amount');
            $table->timestamp('converted_at')->nullable()->after('status');
            $table->timestamp('completed_at')->nullable()->after('converted_at');
            $table->index(['BC', 'status', 'invoice_date'], 'idx_hp_branch_status');
        });

        Schema::table('t_hire_purchase_details', function (Blueprint $table) {
            $table->string('batch_no', 50)->nullable()->after('item_description');
            $table->foreignId('store_id')->nullable()->after('batch_no')->constrained('stores');
            $table->json('serial_numbers')->nullable()->after('store_id');
            $table->integer('returned_qty')->default(0)->after('qty');
        });

        Schema::table('t_instalments', function (Blueprint $table) {
            $table->integer('instalment_no')->default(1)->after('customer_name');
            $table->decimal('base_amount', 15, 2)->default(0)->after('instalment_amount');
            $table->decimal('balance_amount', 15, 2)->default(0)->after('amount_pay');
            $table->string('status', 20)->default('pending')->after('is_waived');
            $table->timestamp('last_payment_at')->nullable()->after('status');
            $table->index(['BC', 'status', 'instalment_date'], 'idx_hp_installment_status');
        });

        Schema::create('t_hp_installment_payments', function (Blueprint $table) {
            $table->id();
            $table->string('payment_no', 50)->unique();
            $table->foreignId('instalment_id')->constrained('t_instalments')->cascadeOnDelete();
            $table->string('invoice_no', 50);
            $table->date('payment_date');
            $table->decimal('principal_amount', 15, 2)->default(0);
            $table->decimal('penalty_amount', 15, 2)->default(0);
            $table->decimal('discount_amount', 15, 2)->default(0);
            $table->decimal('total_amount', 15, 2);
            $table->string('payment_method', 30);
            $table->foreignId('bank_detail_id')->nullable()->constrained('bank_details');
            $table->text('note')->nullable();
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index(['BC', 'payment_date'], 'idx_hp_payment_branch_date');
        });

        Schema::create('hp_status_histories', function (Blueprint $table) {
            $table->id();
            $table->string('invoice_no', 50);
            $table->string('event', 50);
            $table->string('from_status', 30)->nullable();
            $table->string('to_status', 30);
            $table->text('description')->nullable();
            $table->date('event_date');
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index(['invoice_no', 'created_at'], 'idx_hp_history_invoice');
            $table->index(['BC', 'event_date'], 'idx_hp_history_branch_date');
        });

        Schema::table('t_hire_purchase_to_sales', function (Blueprint $table) {
            $table->foreignId('bank_detail_id')->nullable()->after('bank_transfer')->constrained('bank_details');
            $table->text('conversion_note')->nullable()->after('bank_detail_id');
        });

        Schema::table('t_hire_purchase_return_sums', function (Blueprint $table) {
            $table->date('return_date')->nullable()->after('hpreturn_code');
            $table->foreignId('store_id')->nullable()->after('return_date')->constrained('stores');
            $table->text('reason')->nullable()->after('customer_nic');
            $table->decimal('outstanding_written_off', 15, 2)->default(0)->after('net_amount');
            $table->decimal('refund_amount', 15, 2)->default(0)->after('outstanding_written_off');
            $table->string('status', 20)->default('posted')->after('refund_amount');
        });

        Schema::table('t_hire_purchase_return_details', function (Blueprint $table) {
            $table->string('batch_no', 50)->nullable()->after('item_code');
            $table->foreignId('store_id')->nullable()->after('batch_no')->constrained('stores');
            $table->json('serial_numbers')->nullable()->after('store_id');
        });
    }

    public function down(): void
    {
        Schema::table('t_hire_purchase_return_details', function (Blueprint $table) {
            $table->dropConstrainedForeignId('store_id');
            $table->dropColumn(['batch_no', 'serial_numbers']);
        });
        Schema::table('t_hire_purchase_return_sums', function (Blueprint $table) {
            $table->dropConstrainedForeignId('store_id');
            $table->dropColumn([
                'return_date',
                'reason',
                'outstanding_written_off',
                'refund_amount',
                'status',
            ]);
        });
        Schema::table('t_hire_purchase_to_sales', function (Blueprint $table) {
            $table->dropConstrainedForeignId('bank_detail_id');
            $table->dropColumn('conversion_note');
        });
        Schema::dropIfExists('hp_status_histories');
        Schema::dropIfExists('t_hp_installment_payments');
        Schema::table('t_instalments', function (Blueprint $table) {
            $table->dropIndex('idx_hp_installment_status');
            $table->dropColumn([
                'instalment_no',
                'base_amount',
                'balance_amount',
                'status',
                'last_payment_at',
            ]);
        });
        Schema::table('t_hire_purchase_details', function (Blueprint $table) {
            $table->dropConstrainedForeignId('store_id');
            $table->dropColumn(['batch_no', 'serial_numbers', 'returned_qty']);
        });
        Schema::table('t_hire_purchase_sums', function (Blueprint $table) {
            $table->dropIndex('idx_hp_branch_status');
            $table->dropConstrainedForeignId('store_id');
            $table->dropColumn([
                'status',
                'contract_amount',
                'paid_amount',
                'outstanding_amount',
                'returned_amount',
                'converted_at',
                'completed_at',
            ]);
        });
    }
};
