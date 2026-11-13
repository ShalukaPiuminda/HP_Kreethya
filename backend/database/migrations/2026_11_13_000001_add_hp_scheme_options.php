<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('m_schemas', function (Blueprint $table) {
            // ON: document charge is financed into the installments.
            // OFF: document charge is collected upfront with the down payment.
            $table->boolean('IncludeDocumentCharge')->default(true);
            $table->boolean('DownpaymentRequired')->default(true);
            // ON: the first installment is collected when the HP sale is posted.
            $table->boolean('CollectFirstInstallment')->default(false);
        });

        Schema::table('t_hire_purchase_sums', function (Blueprint $table) {
            $table->boolean('document_charge_in_capital')->default(true);
            $table->decimal('first_installment_collected', 15, 2)->default(0);
        });
    }

    public function down(): void
    {
        Schema::table('t_hire_purchase_sums', fn (Blueprint $table) => $table->dropColumn([
            'document_charge_in_capital',
            'first_installment_collected',
        ]));
        Schema::table('m_schemas', fn (Blueprint $table) => $table->dropColumn([
            'IncludeDocumentCharge',
            'DownpaymentRequired',
            'CollectFirstInstallment',
        ]));
    }
};
