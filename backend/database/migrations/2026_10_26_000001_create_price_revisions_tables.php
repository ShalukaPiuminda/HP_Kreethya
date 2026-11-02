<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('price_revisions', function (Blueprint $table) {
            $table->id();
            $table->string('revision_no', 50)->unique();
            $table->string('item_code', 50);
            // selected | store | all | standard | batch (a GRN / opening stock price change)
            $table->string('scope', 20);
            $table->unsignedBigInteger('store_id')->nullable();
            // sales | purchase | both
            $table->string('price_type', 20);
            // set | amount | percent | restore (reversal)
            $table->string('method', 20);
            $table->decimal('sales_value', 15, 2)->nullable();
            $table->decimal('purchase_value', 15, 2)->nullable();
            $table->boolean('update_standard')->default(false);
            $table->string('reason', 255);
            // manual | GRN | OPS | reversal
            $table->string('source', 20)->default('manual');
            $table->string('source_no', 50)->nullable();
            // applied | reversed
            $table->string('status', 20)->default('applied');
            $table->unsignedBigInteger('reverses_id')->nullable();
            $table->unsignedBigInteger('reversed_by_revision_id')->nullable();
            $table->string('reversed_by', 50)->nullable();
            $table->timestamp('reversed_at')->nullable();
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamps();

            $table->index(['BC', 'created_at'], 'idx_price_revision_bc_date');
            $table->index(['item_code', 'BC'], 'idx_price_revision_item');
        });

        Schema::create('price_revision_lines', function (Blueprint $table) {
            $table->id();
            $table->foreignId('price_revision_id')->constrained('price_revisions')->cascadeOnDelete();
            // batch | standard
            $table->string('target', 20);
            $table->unsignedBigInteger('item_batch_id')->nullable();
            $table->string('batch_no', 50)->nullable();
            $table->unsignedBigInteger('store_id')->nullable();
            $table->decimal('old_purchase_price', 15, 2);
            $table->decimal('new_purchase_price', 15, 2);
            $table->decimal('old_sales_price', 15, 2);
            $table->decimal('new_sales_price', 15, 2);
            $table->timestamps();

            $table->index('item_batch_id', 'idx_price_revision_line_batch');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('price_revision_lines');
        Schema::dropIfExists('price_revisions');
    }
};
