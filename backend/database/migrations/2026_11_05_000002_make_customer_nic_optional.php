<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Customers may now be created without a NIC (cash customers). A NIC is still
 * required before a credit sale or HP agreement (enforced in the services).
 *
 * 1. Payments and advances get a customer_code link, backfilled from the NIC
 *    link they used before, so they no longer depend on the customer's NIC.
 * 2. NIC columns that a NIC-less customer can reach become nullable.
 *    HP agreement / HP return NICs stay required (HP always needs a NIC).
 *    The unique index on customers.NIC still applies; it allows many NULLs.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('t_customer_payments', function (Blueprint $table) {
            $table->string('customer_code', 50)->nullable()->after('Payment_date');
            $table->index(['BC', 'customer_code'], 'idx_customer_payments_customer');
        });

        Schema::table('t_advanc_cus_payments', function (Blueprint $table) {
            $table->string('customer_code', 50)->nullable()->after('payment_date');
            $table->index(['BC', 'customer_code'], 'idx_advance_payments_customer');
        });

        // Backfill the new link from the old NIC link (same branch, same NIC).
        DB::table('customers')->select(['Code', 'NIC', 'BC'])->orderBy('id')->each(function ($customer) {
            if ($customer->NIC === null || $customer->NIC === '') {
                return;
            }

            DB::table('t_customer_payments')
                ->where('BC', $customer->BC)
                ->where('Customer_NIC', $customer->NIC)
                ->whereNull('customer_code')
                ->update(['customer_code' => $customer->Code]);

            DB::table('t_advanc_cus_payments')
                ->where('BC', $customer->BC)
                ->where('customer_nic', $customer->NIC)
                ->whereNull('customer_code')
                ->update(['customer_code' => $customer->Code]);
        });

        Schema::table('customers', function (Blueprint $table) {
            $table->string('NIC', 15)->nullable()->change();
        });
        Schema::table('t_invoice_sums', function (Blueprint $table) {
            $table->string('Customer_NIC', 15)->nullable()->change();
        });
        Schema::table('t_customer_payments', function (Blueprint $table) {
            $table->string('Customer_NIC', 15)->nullable()->change();
        });
        Schema::table('t_advanc_cus_payments', function (Blueprint $table) {
            $table->string('customer_nic', 15)->nullable()->change();
        });
        Schema::table('t_sales_return_sums', function (Blueprint $table) {
            $table->string('customer_nic', 15)->nullable()->change();
        });
        Schema::table('t_service_returns', function (Blueprint $table) {
            $table->string('customer_nic', 15)->nullable()->change();
        });
    }

    public function down(): void
    {
        // NIC columns are left nullable: rows without a NIC may exist by now.
        Schema::table('t_advanc_cus_payments', function (Blueprint $table) {
            $table->dropIndex('idx_advance_payments_customer');
            $table->dropColumn('customer_code');
        });

        Schema::table('t_customer_payments', function (Blueprint $table) {
            $table->dropIndex('idx_customer_payments_customer');
            $table->dropColumn('customer_code');
        });
    }
};
