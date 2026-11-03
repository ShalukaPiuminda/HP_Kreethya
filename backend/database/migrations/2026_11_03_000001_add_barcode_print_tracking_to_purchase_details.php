<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('t_purchases_details', function (Blueprint $table) {
            $table->timestamp('barcode_printed_at')->nullable();
            $table->unsignedInteger('barcode_printed_qty')->default(0);
            $table->unsignedInteger('barcode_print_count')->default(0);
            $table->string('barcode_printed_by', 50)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('t_purchases_details', function (Blueprint $table) {
            $table->dropColumn(['barcode_printed_at', 'barcode_printed_qty', 'barcode_print_count', 'barcode_printed_by']);
        });
    }
};
