<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('t_service_returns', function (Blueprint $table) {
            $table->string('status', 40)->default('received')->change();
            $table->string('item_serial_no', 100)->nullable()->change();
            $table->string('customer_code', 50)->nullable()->after('customer_nic');
            $table->text('intake_condition')->nullable()->after('problem_description');
            $table->boolean('is_warranty')->default(false)->after('intake_condition');
            $table->date('expected_completion_date')->nullable()->after('is_warranty');
            $table->string('assigned_technician', 100)->nullable()->after('expected_completion_date');
            $table->text('repair_summary')->nullable()->after('assigned_technician');
            $table->date('completed_date')->nullable()->after('repair_summary');
            $table->foreign('customer_code')->references('Code')->on('customers');
            $table->index(['BC', 'status', 'return_date'], 'idx_service_status_date');
        });

        Schema::table('t_service_dispatches', function (Blueprint $table) {
            $table->string('status', 30)->default('dispatched')->change();
            $table->date('received_date')->nullable()->after('estimated_return');
            $table->string('supplier_reference', 100)->nullable()->after('received_date');
            $table->text('dispatch_notes')->nullable()->after('supplier_reference');
            $table->text('supplier_report')->nullable()->after('dispatch_notes');
            $table->decimal('repair_cost', 15, 2)->default(0)->after('supplier_report');
            $table->decimal('paid_amount', 15, 2)->default(0)->after('repair_cost');
            $table->string('payment_status', 20)->default('unpaid')->after('paid_amount');
        });

        Schema::table('t_service_issues', function (Blueprint $table) {
            $table->string('status', 20)->default('assigned')->after('issue_date');
            $table->date('completed_date')->nullable()->after('technician_name');
            $table->text('diagnosis')->nullable()->after('completed_date');
            $table->text('parts_used')->nullable()->after('repair_details');
            $table->decimal('labor_charge', 15, 2)->default(0)->after('parts_used');
        });

        Schema::table('t_service_invoices', function (Blueprint $table) {
            $table->decimal('paid_amount', 15, 2)->default(0)->after('net_payable');
            $table->string('payment_status', 20)->default('unpaid')->after('paid_amount');
            $table->text('invoice_note')->nullable()->after('payment_status');
            $table->unique('ticket_no', 'idx_service_invoice_ticket_unique');
        });

        Schema::table('t_service_customer_payments', function (Blueprint $table) {
            $table->foreignId('bank_detail_id')->nullable()->after('payment_method')->constrained('bank_details');
            $table->text('payment_note')->nullable()->after('bank_detail_id');
        });

        Schema::table('t_service_supplier_payments', function (Blueprint $table) {
            $table->foreignId('bank_detail_id')->nullable()->after('payment_method')->constrained('bank_details');
            $table->text('payment_note')->nullable()->after('bank_detail_id');
        });
    }

    public function down(): void
    {
        Schema::table('t_service_supplier_payments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('bank_detail_id');
            $table->dropColumn('payment_note');
        });

        Schema::table('t_service_customer_payments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('bank_detail_id');
            $table->dropColumn('payment_note');
        });

        Schema::table('t_service_invoices', function (Blueprint $table) {
            $table->dropUnique('idx_service_invoice_ticket_unique');
            $table->dropColumn(['paid_amount', 'payment_status', 'invoice_note']);
        });

        Schema::table('t_service_issues', function (Blueprint $table) {
            $table->dropColumn(['status', 'completed_date', 'diagnosis', 'parts_used', 'labor_charge']);
        });

        Schema::table('t_service_dispatches', function (Blueprint $table) {
            $table->dropColumn([
                'received_date',
                'supplier_reference',
                'dispatch_notes',
                'supplier_report',
                'repair_cost',
                'paid_amount',
                'payment_status',
            ]);
        });

        Schema::table('t_service_returns', function (Blueprint $table) {
            $table->dropIndex('idx_service_status_date');
            $table->dropForeign(['customer_code']);
            $table->dropColumn([
                'customer_code',
                'intake_condition',
                'is_warranty',
                'expected_completion_date',
                'assigned_technician',
                'repair_summary',
                'completed_date',
            ]);
        });
    }
};
