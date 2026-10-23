<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Running counter for system-generated serial numbers ({item_code}-000001).
        // One row per item per branch; rows are locked while serials are issued.
        Schema::create('serial_sequences', function (Blueprint $table) {
            $table->id();
            $table->string('BC', 20);
            $table->string('item_code', 50);
            $table->unsignedInteger('last_no')->default(0);
            $table->timestamps();
            $table->unique(['BC', 'item_code'], 'idx_serial_seq_bc_item');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('serial_sequences');
    }
};
