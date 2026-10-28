<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Existing installs never re-run the seeder, so give Manager and Cashier
 * Warranty Claims access here (Super Admin already has it implicitly).
 * Roles whose permissions were already set for warranty are left untouched.
 */
return new class extends Migration
{
    public function up(): void
    {
        $grants = [
            'Manager' => ['can_create' => true, 'can_read' => true, 'can_update' => true],
            'Cashier' => ['can_create' => true, 'can_read' => true, 'can_update' => false],
        ];

        foreach ($grants as $roleName => $abilities) {
            $roleId = DB::table('roles')->where('name', $roleName)->value('id');

            if (! $roleId) {
                continue;
            }

            $exists = DB::table('role_permissions')
                ->where('role_id', $roleId)
                ->where('module', 'warranty')
                ->exists();

            if ($exists) {
                continue;
            }

            DB::table('role_permissions')->insert([
                'role_id' => $roleId,
                ...$abilities,
                'module' => 'warranty',
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
        DB::table('role_permissions')->where('module', 'warranty')->delete();
    }
};
