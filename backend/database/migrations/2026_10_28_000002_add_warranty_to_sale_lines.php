<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        foreach (['t_invoice_deils', 't_hire_purchase_details'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->boolean('warranty_enabled')
                    ->default(false)
                    ->after('serial_numbers');
                $table->unsignedSmallInteger('warranty_months')
                    ->nullable()
                    ->after('warranty_enabled');
                $table->date('warranty_expiry_date')
                    ->nullable()
                    ->after('warranty_months')
                    ->index();
            });
        }
    }

    public function down(): void
    {
        foreach (['t_invoice_deils', 't_hire_purchase_details'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table) {
                $table->dropIndex(['warranty_expiry_date']);
                $table->dropColumn([
                    'warranty_enabled',
                    'warranty_months',
                    'warranty_expiry_date',
                ]);
            });
        }
    }
};
