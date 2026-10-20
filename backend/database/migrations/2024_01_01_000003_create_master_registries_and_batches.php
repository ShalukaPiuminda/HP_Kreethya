<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // More Master Registries
        Schema::create('m_schemas', function (Blueprint $table) {
            $table->id();
            $table->string('SchemaType', 50)->unique();
            $table->decimal('DownpaymentPrecentage', 5, 2);
            $table->decimal('InstallmentRate', 5, 2);
            $table->integer('NoOfInstallment');
            $table->decimal('DocumentCharagePrecentage', 5, 2);
            $table->decimal('PanaltyCharage', 5, 2);
            $table->integer('GracePeriodDays')->default(5);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index('SchemaType', 'idx_schema_type');
        });

        Schema::create('m_guarantors', function (Blueprint $table) {
            $table->id();
            $table->string('Code', 50)->unique();
            $table->string('name', 100);
            $table->string('NIC', 15)->unique();
            $table->string('phone', 15)->nullable();
            $table->text('address')->nullable();
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index('NIC', 'idx_guarantor_nic');
        });

        Schema::create('bank_details', function (Blueprint $table) {
            $table->id();
            $table->string('bank_name', 100);
            $table->string('account_no', 50);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('bank_branches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('bank_id')->constrained('bank_details')->cascadeOnDelete();
            $table->string('branch_name', 100);
            $table->string('branch_code', 10);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('m_areas', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100)->unique();
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('m_routes', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100);
            $table->foreignId('area_id')->constrained('m_areas')->cascadeOnDelete();
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
            $table->index('area_id', 'idx_route_area');
        });

        Schema::create('m_salesmen', function (Blueprint $table) {
            $table->id();
            $table->string('name', 100);
            $table->string('phone', 15)->nullable();
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('sales_return_reasons', function (Blueprint $table) {
            $table->id();
            $table->string('reason', 255);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamp('created_at')->useCurrent();
        });

        // 4. BATCH & SERIAL STOCKS
        Schema::create('item_batches', function (Blueprint $table) {
            $table->id();
            $table->string('batch_no', 50);
            $table->string('item_code', 50);
            $table->foreignId('store_id')->constrained();
            $table->decimal('purchase_price', 15, 2);
            $table->decimal('sales_price', 15, 2);
            $table->integer('qty_in_hand')->default(0);
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamps();
            $table->foreign('item_code')->references('item_code')->on('items');
            $table->unique(['batch_no', 'item_code', 'store_id'], 'idx_batch_item_store');
            $table->index('batch_no', 'idx_batch_no');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('item_batches');
        Schema::dropIfExists('sales_return_reasons');
        Schema::dropIfExists('m_salesmen');
        Schema::dropIfExists('m_routes');
        Schema::dropIfExists('m_areas');
        Schema::dropIfExists('bank_branches');
        Schema::dropIfExists('bank_details');
        Schema::dropIfExists('m_guarantors');
        Schema::dropIfExists('m_schemas');
    }
};
