<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('t_purchases_details', 'free_qty')) {
            Schema::table('t_purchases_details', function (Blueprint $table) {
                $table->integer('free_qty')->default(0)->after('QTY');
            });
        }

        foreach ([
            't_invoice_sums',
            't_customer_payments',
            't_supplier_payments',
            't_advanc_cus_payments',
        ] as $tableName) {
            if (! Schema::hasColumn($tableName, 'bank_detail_id')) {
                Schema::table($tableName, function (Blueprint $table) {
                    $table->foreignId('bank_detail_id')
                        ->nullable()
                        ->after('bank_transfer')
                        ->constrained('bank_details')
                        ->nullOnDelete();
                });
            }
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('t_purchases_details', 'free_qty')) {
            Schema::table('t_purchases_details', function (Blueprint $table) {
                $table->dropColumn('free_qty');
            });
        }

        foreach ([
            't_invoice_sums',
            't_customer_payments',
            't_supplier_payments',
            't_advanc_cus_payments',
        ] as $tableName) {
            if (Schema::hasColumn($tableName, 'bank_detail_id')) {
                Schema::table($tableName, function (Blueprint $table) {
                    $table->dropConstrainedForeignId('bank_detail_id');
                });
            }
        }
    }
};
