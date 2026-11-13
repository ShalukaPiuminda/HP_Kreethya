<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * NIC lock for customers with credit sales or HP agreements:
 * - customer_change_logs gets a `reason` column (required for locked NIC changes).
 * - New permission module `customer-nic` ("Edit NIC" after credit/HP), granted to
 *   the Manager role. Super Admin has it implicitly. Existing settings are kept.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customer_change_logs', function (Blueprint $table) {
            $table->string('reason', 255)->nullable()->after('new_values');
        });

        $managerId = DB::table('roles')->where('name', 'Manager')->value('id');

        if ($managerId && ! DB::table('role_permissions')->where('role_id', $managerId)->where('module', 'customer-nic')->exists()) {
            DB::table('role_permissions')->insert([
                'role_id' => $managerId,
                'module' => 'customer-nic',
                'can_create' => false,
                'can_read' => true,
                'can_update' => true,
                'can_delete' => false,
                'BC' => 'HQ',
                'UID' => 'system',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        DB::table('role_permissions')->where('module', 'customer-nic')->delete();

        Schema::table('customer_change_logs', function (Blueprint $table) {
            $table->dropColumn('reason');
        });
    }
};
