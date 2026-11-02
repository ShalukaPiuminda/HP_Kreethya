<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('warranty_claims', function (Blueprint $table) {
            $table->id();
            $table->string('claim_no', 30);
            $table->date('claim_date');
            $table->string('item_code', 50);
            $table->string('item_serial_no', 100);
            $table->unsignedBigInteger('serial_warranty_id')->nullable();
            $table->string('sale_no', 50)->nullable();
            $table->string('customer_code', 50)->nullable();
            $table->string('customer_name', 150)->nullable();
            $table->string('customer_phone', 50)->nullable();
            $table->text('fault_description');
            $table->string('accessories_received', 255)->nullable();
            $table->boolean('is_within_warranty')->default(false);
            $table->date('customer_warranty_expiry')->nullable();
            $table->string('supplier_code', 50)->nullable();
            $table->boolean('is_supplier_claimable')->default(false);
            $table->string('status', 30)->default('received');
            $table->string('supplier_ref_no', 50)->nullable();
            $table->date('sent_date')->nullable();
            $table->date('returned_date')->nullable();
            $table->string('resolution', 20)->nullable();
            $table->string('replacement_serial_no', 100)->nullable();
            $table->unsignedBigInteger('store_id')->nullable();
            $table->text('remarks')->nullable();
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamps();

            $table->unique(['BC', 'claim_no'], 'idx_warranty_claim_no');
            $table->index(['BC', 'status'], 'idx_warranty_claim_status');
            $table->index(['BC', 'item_serial_no'], 'idx_warranty_claim_serial');
        });

        Schema::create('warranty_claim_logs', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('warranty_claim_id');
            $table->string('from_status', 30)->nullable();
            $table->string('to_status', 30);
            $table->text('note')->nullable();
            $table->string('UID', 50);
            $table->timestamp('created_at')->nullable();

            $table->foreign('warranty_claim_id')
                ->references('id')
                ->on('warranty_claims')
                ->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('warranty_claim_logs');
        Schema::dropIfExists('warranty_claims');
    }
};
