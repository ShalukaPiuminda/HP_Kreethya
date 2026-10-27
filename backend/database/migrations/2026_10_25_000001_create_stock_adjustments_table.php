<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_adjustments', function (Blueprint $table) {
            $table->id();
            $table->string('trans_no', 50);
            $table->string('item_code', 50);
            $table->unsignedBigInteger('store_id');
            $table->string('batch_no', 50)->nullable();
            $table->integer('old_qty');
            $table->integer('new_qty');
            $table->integer('diff_qty');
            $table->string('reason', 30);
            $table->text('note');
            $table->json('serial_numbers')->nullable();
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamps();

            $table->index(['BC', 'created_at'], 'idx_stock_adj_branch_date');
            $table->index(['item_code', 'store_id'], 'idx_stock_adj_item_store');
            $table->index('trans_no', 'idx_stock_adj_trans');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_adjustments');
    }
};
