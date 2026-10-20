<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('t_invoice_sums', function (Blueprint $table) {
            $table->decimal('returned_amount', 15, 2)->default(0)->after('paid_amount');
        });

        Schema::table('t_sales_return_sums', function (Blueprint $table) {
            $table->foreignId('store_id')->nullable()->after('reason_id')->constrained('stores');
            $table->decimal('credit_adjustment', 15, 2)->default(0)->after('net_amount');
            $table->decimal('refund_amount', 15, 2)->default(0)->after('credit_adjustment');
            $table->string('refund_method', 20)->default('cash')->after('refund_amount');
            $table->string('status', 20)->default('posted')->after('refund_method');
        });

        Schema::table('t_sales_return_details', function (Blueprint $table) {
            $table->foreignId('invoice_detail_id')->nullable()->after('return_no')->constrained('t_invoice_deils');
            $table->string('batch_no', 50)->nullable()->after('item_code');
            $table->foreignId('store_id')->nullable()->after('batch_no')->constrained('stores');
            $table->json('serial_numbers')->nullable()->after('store_id');
        });
    }

    public function down(): void
    {
        Schema::table('t_sales_return_details', function (Blueprint $table) {
            $table->dropConstrainedForeignId('invoice_detail_id');
            $table->dropConstrainedForeignId('store_id');
            $table->dropColumn(['batch_no', 'serial_numbers']);
        });

        Schema::table('t_sales_return_sums', function (Blueprint $table) {
            $table->dropConstrainedForeignId('store_id');
            $table->dropColumn([
                'credit_adjustment',
                'refund_amount',
                'refund_method',
                'status',
            ]);
        });

        Schema::table('t_invoice_sums', function (Blueprint $table) {
            $table->dropColumn('returned_amount');
        });
    }
};
