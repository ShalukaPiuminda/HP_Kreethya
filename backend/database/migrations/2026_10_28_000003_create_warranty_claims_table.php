<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('t_warranty_claims', function (Blueprint $table) {
            $table->id();
            $table->string('claim_no', 50)->unique();
            $table->date('claim_date');
            $table->enum('source_type', ['invoice', 'hp']);
            $table->string('invoice_no', 50)->index();
            $table->string('agreement_no', 50)->nullable();
            $table->unsignedBigInteger('source_detail_id');
            $table->string('customer_code', 50)->nullable();
            $table->string('customer_name')->nullable();
            $table->string('item_code', 50)->index();
            $table->string('item_description')->nullable();
            $table->string('sold_serial_no', 100)->nullable();
            $table->string('item_serial_no', 100)->nullable()->index();
            $table->integer('qty')->default(1);
            $table->date('warranty_expiry_date');
            $table->text('problem_description');
            $table->enum('resolution', ['repair', 'replace', 'refund', 'reject']);
            $table->enum('status', ['open', 'completed', 'rejected'])->default('open');
            $table->string('service_ticket_no', 50)->nullable()->index();
            $table->string('replacement_serial_no', 100)->nullable()->index();
            $table->string('replacement_batch_no', 50)->nullable();
            $table->unsignedBigInteger('replacement_store_id')->nullable();
            $table->string('sales_return_no', 50)->nullable();
            $table->text('remarks')->nullable();
            $table->date('completed_date')->nullable();
            $table->unsignedBigInteger('store_id')->nullable();
            $table->string('BC', 10)->index();
            $table->string('UID', 50)->nullable();
            $table->timestamps();

            $table->index(['source_type', 'source_detail_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('t_warranty_claims');
    }
};
