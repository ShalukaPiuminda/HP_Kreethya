<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 9. SERVICE MODULE
        Schema::create('t_service_returns', function (Blueprint $table) {
            $table->id();
            $table->string('ticket_no', 50)->unique();
            $table->date('return_date');
            $table->string('customer_nic', 15);
            $table->string('customer_name', 100);
            $table->string('customer_phone', 15)->nullable();
            $table->string('item_code', 50);
            $table->string('item_serial_no', 100);
            $table->text('problem_description');
            $table->enum('status', ['received', 'dispatched_to_supplier', 'received_from_supplier', 'issued_to_customer', 'completed'])->default('received');
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('item_code')->references('item_code')->on('items');
            $table->index('ticket_no', 'idx_service_ticket');
            $table->index('item_serial_no', 'idx_service_serial');
            $table->index('BC', 'idx_service_bc');
        });

        Schema::create('t_service_dispatches', function (Blueprint $table) {
            $table->id();
            $table->string('dispatch_no', 50)->unique();
            $table->string('ticket_no', 50);
            $table->string('supplier_code', 50);
            $table->date('dispatch_date');
            $table->date('estimated_return')->nullable();
            $table->enum('status', ['dispatched', 'received_back'])->default('dispatched');
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('ticket_no')->references('ticket_no')->on('t_service_returns')->cascadeOnDelete();
            $table->foreign('supplier_code')->references('Code')->on('suppliers');
            $table->index('ticket_no', 'idx_dispatch_ticket');
        });

        Schema::create('t_service_issues', function (Blueprint $table) {
            $table->id();
            $table->string('issue_no', 50)->unique();
            $table->string('ticket_no', 50);
            $table->date('issue_date');
            $table->string('technician_name', 100)->nullable();
            $table->text('repair_details')->nullable();
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('ticket_no')->references('ticket_no')->on('t_service_returns')->cascadeOnDelete();
        });

        Schema::create('t_service_invoices', function (Blueprint $table) {
            $table->id();
            $table->string('invoice_no', 50)->unique();
            $table->string('ticket_no', 50);
            $table->date('invoice_date');
            $table->decimal('service_charge', 15, 2);
            $table->decimal('supplier_repair_cost', 15, 2)->default(0);
            $table->decimal('net_payable', 15, 2);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('ticket_no')->references('ticket_no')->on('t_service_returns')->cascadeOnDelete();
            $table->index('ticket_no', 'idx_srv_invoice_ticket');
        });

        Schema::create('t_service_customer_payments', function (Blueprint $table) {
            $table->id();
            $table->string('payment_no', 50)->unique();
            $table->string('invoice_no', 50);
            $table->date('payment_date');
            $table->decimal('amount', 15, 2);
            $table->enum('payment_method', ['cash', 'card', 'bank_transfer']);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('invoice_no')->references('invoice_no')->on('t_service_invoices')->cascadeOnDelete();
        });

        Schema::create('t_service_supplier_payments', function (Blueprint $table) {
            $table->id();
            $table->string('payment_no', 50)->unique();
            $table->string('dispatch_no', 50);
            $table->date('payment_date');
            $table->decimal('amount', 15, 2);
            $table->enum('payment_method', ['cash', 'bank_transfer', 'cheque']);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->foreign('dispatch_no')->references('dispatch_no')->on('t_service_dispatches')->cascadeOnDelete();
        });

        Schema::create('t_service_item_tracks', function (Blueprint $table) {
            $table->id();
            $table->string('ticket_no', 50);
            $table->string('event_name', 100);
            $table->text('description')->nullable();
            $table->timestamp('event_date')->useCurrent();
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->foreign('ticket_no')->references('ticket_no')->on('t_service_returns')->cascadeOnDelete();
            $table->index('ticket_no', 'idx_track_ticket');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('t_service_item_tracks');
        Schema::dropIfExists('t_service_supplier_payments');
        Schema::dropIfExists('t_service_customer_payments');
        Schema::dropIfExists('t_service_invoices');
        Schema::dropIfExists('t_service_issues');
        Schema::dropIfExists('t_service_dispatches');
        Schema::dropIfExists('t_service_returns');
    }
};
