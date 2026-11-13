<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Service tickets: verified warranty link, claim link and handover to the customer.
        Schema::table('t_service_returns', function (Blueprint $table) {
            $table->unsignedBigInteger('serial_warranty_id')->nullable()->after('is_warranty');
            $table->date('warranty_expiry')->nullable()->after('serial_warranty_id');
            $table->string('sale_no', 50)->nullable()->after('warranty_expiry');
            $table->unsignedBigInteger('warranty_claim_id')->nullable()->after('sale_no');
            $table->dateTime('handed_over_at')->nullable()->after('completed_date');
            $table->string('handed_over_to', 150)->nullable()->after('handed_over_at');
            $table->string('handed_over_nic', 20)->nullable()->after('handed_over_to');
            $table->text('handover_note')->nullable()->after('handed_over_nic');
            $table->string('handed_over_by', 50)->nullable()->after('handover_note');

            $table->index('warranty_claim_id', 'idx_service_warranty_claim');
            $table->index('serial_warranty_id', 'idx_service_serial_warranty');
        });

        // Warranty claims: service ticket link, handover and cancellation.
        Schema::table('warranty_claims', function (Blueprint $table) {
            $table->string('service_ticket_no', 50)->nullable()->after('store_id');
            $table->dateTime('handed_over_at')->nullable()->after('service_ticket_no');
            $table->string('handed_over_to', 150)->nullable()->after('handed_over_at');
            $table->string('handed_over_nic', 20)->nullable()->after('handed_over_to');
            $table->text('handover_note')->nullable()->after('handed_over_nic');
            $table->string('handed_over_by', 50)->nullable()->after('handover_note');
            $table->text('cancel_reason')->nullable()->after('handed_over_by');
        });
    }

    public function down(): void
    {
        Schema::table('warranty_claims', function (Blueprint $table) {
            $table->dropColumn([
                'service_ticket_no',
                'handed_over_at',
                'handed_over_to',
                'handed_over_nic',
                'handover_note',
                'handed_over_by',
                'cancel_reason',
            ]);
        });

        Schema::table('t_service_returns', function (Blueprint $table) {
            $table->dropIndex('idx_service_warranty_claim');
            $table->dropIndex('idx_service_serial_warranty');
            $table->dropColumn([
                'serial_warranty_id',
                'warranty_expiry',
                'sale_no',
                'warranty_claim_id',
                'handed_over_at',
                'handed_over_to',
                'handed_over_nic',
                'handover_note',
                'handed_over_by',
            ]);
        });
    }
};
