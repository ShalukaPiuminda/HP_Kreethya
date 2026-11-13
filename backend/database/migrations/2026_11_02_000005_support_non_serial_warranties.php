<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Non-serialized items get one warranty row per sale line (no serial number),
        // holding the sold and returned quantity. Claims are then found by invoice.
        Schema::table('serial_warranties', function (Blueprint $table) {
            $table->string('item_serial_no', 100)->nullable()->change();
            $table->string('batch_no', 50)->nullable()->after('item_serial_no');
            $table->unsignedInteger('qty')->default(1)->after('batch_no');
            $table->unsignedInteger('returned_qty')->default(0)->after('qty');
        });

        Schema::table('warranty_claims', function (Blueprint $table) {
            $table->string('item_serial_no', 100)->nullable()->change();
            $table->unsignedInteger('qty')->default(1)->after('item_serial_no');
            $table->string('batch_no', 50)->nullable()->after('qty');
            $table->index(['BC', 'sale_no'], 'idx_warranty_claim_sale');
        });
    }

    public function down(): void
    {
        Schema::table('warranty_claims', function (Blueprint $table) {
            $table->dropIndex('idx_warranty_claim_sale');
            $table->dropColumn(['qty', 'batch_no']);
        });

        Schema::table('serial_warranties', function (Blueprint $table) {
            $table->dropColumn(['batch_no', 'qty', 'returned_qty']);
        });
    }
};
