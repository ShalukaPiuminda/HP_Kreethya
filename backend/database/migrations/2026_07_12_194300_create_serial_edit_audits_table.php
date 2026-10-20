<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('serial_edit_audits', function (Blueprint $table) {
            $table->id();
            $table->string('source_type', 20);
            $table->string('source_no', 50);
            $table->string('item_code', 50);
            $table->unsignedBigInteger('store_id');
            $table->string('old_serial_no', 100)->nullable();
            $table->string('new_serial_no', 100)->nullable();
            $table->string('BC', 10);
            $table->string('UID', 50);
            $table->timestamps();

            $table->index(['source_type', 'source_no'], 'idx_serial_audit_source');
            $table->index(['item_code', 'old_serial_no', 'new_serial_no'], 'idx_serial_audit_item_serial');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('serial_edit_audits');
    }
};
