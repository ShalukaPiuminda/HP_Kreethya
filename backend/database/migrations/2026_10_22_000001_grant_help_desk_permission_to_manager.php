<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Existing installs never re-run the seeder, so give the Manager role
 * Help Desk access here (Super Admin already has it implicitly). Roles
 * whose permissions were already set for help-desk are left untouched.
 */
return new class extends Migration
{
    public function up(): void
    {
        $managerId = DB::table('roles')->where('name', 'Manager')->value('id');

        if (! $managerId) {
            return;
        }

        $exists = DB::table('role_permissions')
            ->where('role_id', $managerId)
            ->where('module', 'help-desk')
            ->exists();

        if ($exists) {
            return;
        }

        DB::table('role_permissions')->insert([
            'role_id' => $managerId,
            'module' => 'help-desk',
            'can_create' => true,
            'can_read' => true,
            'can_update' => false,
            'can_delete' => false,
            'BC' => 'HQ',
            'UID' => 'system',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function down(): void
    {
        DB::table('role_permissions')->where('module', 'help-desk')->delete();
    }
};
