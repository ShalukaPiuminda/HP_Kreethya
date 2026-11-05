<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * One row per record whose copied customer details were overwritten,
     * so every change can be audited and undone.
     */
    public function up(): void
    {
        Schema::create('customer_change_logs', function (Blueprint $table) {
            $table->id();
            $table->string('customer_code', 50);
            $table->string('source', 30); // customer_update | sync_command
            $table->string('table_name', 64);
            $table->unsignedBigInteger('record_id');
            $table->json('old_values');
            $table->json('new_values');
            $table->string('BC', 10);
            $table->string('UID', 50)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['customer_code', 'created_at'], 'idx_customer_change_logs_customer');
            $table->index(['table_name', 'record_id'], 'idx_customer_change_logs_record');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('customer_change_logs');
    }
};
