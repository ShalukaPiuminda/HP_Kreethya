<?php

namespace Database\Seeders;

use App\Models\BranchDel;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use RuntimeException;

/**
 * Creates (or resets) the hidden vendor "developer" account that controls paid features.
 * The password comes from DEVELOPER_PASSWORD in .env and is stored hashed.
 */
class DeveloperUserSeeder extends Seeder
{
    public function run(): void
    {
        $password = (string) config('services.developer.password');
        if (strlen($password) < 8) {
            throw new RuntimeException('Set DEVELOPER_PASSWORD (min 8 characters) in .env before creating the developer account.');
        }

        $role = Role::firstOrCreate(
            ['name' => Role::SUPER_ADMIN],
            ['description' => 'Full system access. Permissions are implicit.']
        );
        $branchCode = (string) (config('services.developer.branch') ?: BranchDel::query()->orderBy('id')->value('bccode') ?: 'HQ');

        $user = User::query()->where('username', 'developer')->first() ?? new User(['username' => 'developer']);
        $user->fill([
            'email' => $user->email ?: 'developer@system.local',
            'password' => $password,
            'role_id' => $role->id,
            'BC' => $user->BC ?: $branchCode,
        ]);
        $user->is_developer = true;
        $user->save();
    }
}
