<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Existing installs never re-run the seeder, so give the Manager role
 * Warranty access here (Super Admin already has it implicitly).
 * Roles whose permissions were already set for these modules are left untouched.
 */
return new class extends Migration
{
    private const MODULES = ['warranty-claims', 'warranty-lookup'];

    public function up(): void
    {
        $managerId = DB::table('roles')->where('name', 'Manager')->value('id');

        if (! $managerId) {
            return;
        }

        foreach (self::MODULES as $module) {
            $exists = DB::table('role_permissions')
                ->where('role_id', $managerId)
                ->where('module', $module)
                ->exists();

            if ($exists) {
                continue;
            }

            DB::table('role_permissions')->insert([
                'role_id' => $managerId,
                'module' => $module,
                'can_create' => $module === 'warranty-claims',
                'can_read' => true,
                'can_update' => $module === 'warranty-claims',
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
        DB::table('role_permissions')->whereIn('module', self::MODULES)->delete();
    }
};
