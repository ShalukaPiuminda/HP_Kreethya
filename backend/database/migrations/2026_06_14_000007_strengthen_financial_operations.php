<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('m_chartof_accounts', function (Blueprint $table) {
            $table->boolean('is_active')->default(true)->after('type_id');
            $table->decimal('opening_balance', 15, 2)->default(0)->after('is_active');
        });

        Schema::table('t_payment_vouchers', function (Blueprint $table) {
            $table->string('status', 20)->default('draft')->after('amount');
            $table->string('payment_method', 30)->default('cash')->after('status');
            $table->foreignId('bank_detail_id')->nullable()->after('payment_method')->constrained('bank_details');
            $table->foreignId('approved_by')->nullable()->after('bank_detail_id')->constrained('users');
            $table->timestamp('approved_at')->nullable()->after('approved_by');
            $table->text('cancellation_reason')->nullable()->after('approved_at');
            $table->index(['BC', 'status', 'date'], 'idx_voucher_status_date');
        });

        Schema::table('t_expenses', function (Blueprint $table) {
            $table->string('expense_account_code', 20)->nullable()->after('ExpenseType');
            $table->string('payment_method', 30)->default('cash')->after('Expense_Amount');
            $table->foreignId('bank_detail_id')->nullable()->after('payment_method')->constrained('bank_details');
            $table->string('status', 20)->default('posted')->after('bank_detail_id');
            $table->index(['BC', 'status', 'Expense_date'], 'idx_expense_status_date');
        });

        Schema::table('t_bank_entries', function (Blueprint $table) {
            $table->string('entry_type', 30)->default('deposit')->after('bank_detail_id');
            $table->string('status', 20)->default('posted')->after('bank_charges');
            $table->index(['BC', 'entry_type', 'date'], 'idx_bank_entry_type_date');
        });

        Schema::table('day_end_balances', function (Blueprint $table) {
            $table->decimal('counted_cash', 15, 2)->nullable()->after('closing_balance');
            $table->decimal('variance', 15, 2)->default(0)->after('counted_cash');
            $table->text('notes')->nullable()->after('total_cr');
        });
    }

    public function down(): void
    {
        Schema::table('day_end_balances', function (Blueprint $table) {
            $table->dropColumn(['counted_cash', 'variance', 'notes']);
        });
        Schema::table('t_bank_entries', function (Blueprint $table) {
            $table->dropIndex('idx_bank_entry_type_date');
            $table->dropColumn(['entry_type', 'status']);
        });
        Schema::table('t_expenses', function (Blueprint $table) {
            $table->dropIndex('idx_expense_status_date');
            $table->dropConstrainedForeignId('bank_detail_id');
            $table->dropColumn(['expense_account_code', 'payment_method', 'status']);
        });
        Schema::table('t_payment_vouchers', function (Blueprint $table) {
            $table->dropIndex('idx_voucher_status_date');
            $table->dropConstrainedForeignId('bank_detail_id');
            $table->dropConstrainedForeignId('approved_by');
            $table->dropColumn([
                'status',
                'payment_method',
                'approved_at',
                'cancellation_reason',
            ]);
        });
        Schema::table('m_chartof_accounts', function (Blueprint $table) {
            $table->dropColumn(['is_active', 'opening_balance']);
        });
    }
};
