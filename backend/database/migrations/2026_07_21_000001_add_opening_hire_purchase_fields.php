<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('t_hire_purchase_sums', function (Blueprint $table) {
            $table->boolean('is_opening')->default(false)->after('is_cash_converted');
            $table->string('opening_reference_no', 100)->nullable()->after('reference_no');
            $table->text('opening_note')->nullable()->after('opening_reference_no');
        });
    }

    public function down(): void
    {
        Schema::table('t_hire_purchase_sums', function (Blueprint $table) {
            $table->dropColumn(['is_opening', 'opening_reference_no', 'opening_note']);
        });
    }
};
