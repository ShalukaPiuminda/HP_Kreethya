<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('m_schemas', function (Blueprint $table) {
            // 'percentage', 'fixed', or 'range'
            $table->string('DocumentChargeType', 20)->default('percentage')->after('NoOfInstallment');
            $table->decimal('DocumentCharagePrecentage', 5, 2)->default(0)->change();
            $table->decimal('DocumentChargeAmount', 15, 2)->default(0)->after('DocumentCharagePrecentage');
        });

        Schema::create('m_schema_document_charge_ranges', function (Blueprint $table) {
            $table->id();
            $table->foreignId('schema_id')->constrained('m_schemas')->cascadeOnDelete();
            $table->decimal('from_amount', 15, 2);
            $table->decimal('to_amount', 15, 2);
            $table->string('charge_type', 20)->default('percentage'); // 'percentage' or 'fixed'
            $table->decimal('charge_value', 15, 2)->default(0);
            $table->string('BC', 10)->nullable();
            $table->timestamps();

            $table->index('schema_id');
            $table->index(['from_amount', 'to_amount']);
        });

        Schema::table('t_hire_purchase_sums', function (Blueprint $table) {
            $table->string('document_charge_type', 20)->default('percentage')->after('schema_type');
        });
    }

    public function down(): void
    {
        Schema::table('t_hire_purchase_sums', function (Blueprint $table) {
            $table->dropColumn('document_charge_type');
        });

        Schema::dropIfExists('m_schema_document_charge_ranges');

        Schema::table('m_schemas', function (Blueprint $table) {
            $table->dropColumn([
                'DocumentChargeType',
                'DocumentChargeAmount',
            ]);
        });
    }
};
