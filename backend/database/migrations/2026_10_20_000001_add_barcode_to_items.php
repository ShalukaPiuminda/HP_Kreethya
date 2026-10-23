<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('items', function (Blueprint $table) {
            // Product barcode (EAN/UPC/Code 128). Stored as text so leading zeros survive.
            // Existing items stay NULL; unique per branch because items are branch-owned.
            $table->string('barcode', 50)
                ->nullable()
                ->after('item_description');
            $table->unique(['BC', 'barcode'], 'idx_item_bc_barcode');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropUnique('idx_item_bc_barcode');
            $table->dropColumn('barcode');
        });
    }
};
