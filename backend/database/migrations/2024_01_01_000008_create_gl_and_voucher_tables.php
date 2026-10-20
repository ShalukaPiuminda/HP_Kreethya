<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 10. GENERAL LEDGER ACCOUNTING
        Schema::create('m_main_categories', function (Blueprint $table) {
            $table->id();
            $table->string('name', 50)->unique();
        });

        Schema::create('m_main_account_types', function (Blueprint $table) {
            $table->id();
            $table->foreignId('category_id')->constrained('m_main_categories');
            $table->string('name', 50);
        });

        Schema::create('m_chartof_accounts', function (Blueprint $table) {
            $table->id();
            $table->string('code', 20)->unique();
            $table->string('description', 150);
            $table->foreignId('type_id')->constrained('m_main_account_types');
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index('code', 'idx_chart_code');
            $table->index('BC', 'idx_chart_bc');
        });

        Schema::create('t_account_trans', function (Blueprint $table) {
            $table->id();
            $table->string('trance_type', 50);
            $table->date('Ddate');
            $table->decimal('dr_amount', 15, 2)->default(0);
            $table->decimal('cr_amount', 15, 2)->default(0);
            $table->string('AccCode', 20);
            $table->string('trance_no', 50);
            $table->string('no', 50);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('AccCode')->references('code')->on('m_chartof_accounts');
            $table->index(['AccCode', 'Ddate'], 'idx_ledger_code_date');
            $table->index(['BC', 'Ddate'], 'idx_ledger_bc_date');
        });

        Schema::create('day_end_balances', function (Blueprint $table) {
            $table->id();
            $table->string('BC', 10);
            $table->date('close_date');
            $table->decimal('opening_balance', 15, 2)->default(0);
            $table->decimal('closing_balance', 15, 2);
            $table->decimal('total_dr', 15, 2);
            $table->decimal('total_cr', 15, 2);
            $table->foreignId('closed_by')->constrained('users');
            $table->timestamp('closed_at')->useCurrent();
            $table->unique(['BC', 'close_date'], 'idx_bc_close_date');
        });

        // 11. GENERAL TRANSACTION DOCUMENTS
        Schema::create('t_payment_vouchers', function (Blueprint $table) {
            $table->id();
            $table->string('invoice_no', 50)->unique();
            $table->date('date');
            $table->decimal('cramount', 15, 2)->default(0);
            $table->string('crcode', 20);
            $table->decimal('dramount', 15, 2)->default(0);
            $table->string('drcode', 20);
            $table->text('description')->nullable();
            $table->decimal('amount', 15, 2);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index(['BC', 'date'], 'idx_voucher_bc_date');
        });

        Schema::create('t_petty_cashes', function (Blueprint $table) {
            $table->id();
            $table->string('invoice_no', 50)->unique();
            $table->date('date');
            $table->decimal('cramount', 15, 2)->default(0);
            $table->string('crcode', 20);
            $table->decimal('dramount', 15, 2)->default(0);
            $table->string('drcode', 20);
            $table->text('description')->nullable();
            $table->decimal('amount', 15, 2);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index(['BC', 'date'], 'idx_petty_bc_date');
        });

        Schema::create('t_expenses', function (Blueprint $table) {
            $table->id();
            $table->string('Expense_no', 50)->unique();
            $table->date('Expense_date');
            $table->string('ExpenseType', 100);
            $table->text('Expense_note')->nullable();
            $table->decimal('Expense_Amount', 15, 2);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index(['BC', 'Expense_date'], 'idx_expense_bc_date');
        });

        Schema::create('t_cashouts', function (Blueprint $table) {
            $table->id();
            $table->string('Cashout_no', 50)->unique();
            $table->date('Cashout_date');
            $table->string('Account', 100);
            $table->text('Cashout_note')->nullable();
            $table->decimal('Cashout_amount', 15, 2);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index(['BC', 'Cashout_date'], 'idx_cashout_bc_date');
        });

        Schema::create('t_bank_entries', function (Blueprint $table) {
            $table->id();
            $table->string('invoice_no', 50)->unique();
            $table->date('date');
            $table->decimal('cramount', 15, 2)->default(0);
            $table->string('crcode', 20);
            $table->decimal('dramount', 15, 2)->default(0);
            $table->string('drcode', 20);
            $table->text('description')->nullable();
            $table->decimal('amount', 15, 2);
            $table->decimal('bank_charges', 15, 2)->default(0);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index(['BC', 'date'], 'idx_bank_entry_bc_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('t_bank_entries');
        Schema::dropIfExists('t_cashouts');
        Schema::dropIfExists('t_expenses');
        Schema::dropIfExists('t_petty_cashes');
        Schema::dropIfExists('t_payment_vouchers');
        Schema::dropIfExists('day_end_balances');
        Schema::dropIfExists('t_account_trans');
        Schema::dropIfExists('m_chartof_accounts');
        Schema::dropIfExists('m_main_account_types');
        Schema::dropIfExists('m_main_categories');
    }
};
