<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AuthAuthorizationTest extends TestCase
{
    use RefreshDatabase;

    public function test_login_returns_bearer_token_role_and_permissions(): void
    {
        $role = Role::create([
            'name' => 'Manager',
            'description' => 'Branch manager',
        ]);

        RolePermission::create([
            'role_id' => $role->id,
            'module' => 'items',
            'can_create' => false,
            'can_read' => true,
            'can_update' => false,
            'can_delete' => false,
            'BC' => 'HQ',
            'UID' => 'system',
        ]);

        User::create([
            'username' => 'manager',
            'email' => 'manager@erp.com',
            'password' => 'password',
            'role_id' => $role->id,
            'BC' => 'HQ',
        ]);

        $this->postJson('/api/v1/login', [
            'email' => 'MANAGER@ERP.COM',
            'password' => 'password',
            'device_name' => 'test-browser',
        ])->assertOk()
            ->assertJsonPath('data.token_type', 'Bearer')
            ->assertJsonPath('data.user.role.name', 'Manager')
            ->assertJsonPath('data.user.role.permissions.0.module', 'items')
            ->assertJsonPath('data.user.role.permissions.0.can_read', true);

        $this->assertDatabaseCount('personal_access_tokens', 1);
    }

    public function test_invalid_credentials_return_validation_error(): void
    {
        $this->postJson('/api/v1/login', [
            'email' => 'missing@erp.com',
            'password' => 'wrong-password',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('email');
    }

    public function test_role_permissions_are_not_tied_to_the_permission_audit_branch(): void
    {
        $role = Role::create([
            'name' => 'Manager',
            'description' => 'Branch manager',
        ]);

        RolePermission::create([
            'role_id' => $role->id,
            'module' => 'items',
            'can_create' => false,
            'can_read' => true,
            'can_update' => false,
            'can_delete' => false,
            'BC' => 'HQ',
            'UID' => 'system',
        ]);

        $user = User::create([
            'username' => 'branch-manager',
            'email' => 'branch@example.com',
            'password' => 'password',
            'role_id' => $role->id,
            'BC' => 'BR02',
        ]);

        Sanctum::actingAs($user);

        $this->getJson('/api/v1/items')->assertOk();
        $this->postJson('/api/v1/items', [])->assertForbidden();
    }

    public function test_user_and_role_administration_requires_super_admin_role_name(): void
    {
        $managerRole = Role::create([
            'name' => 'Manager',
            'description' => 'Branch manager',
        ]);

        $manager = User::create([
            'username' => 'manager',
            'email' => 'manager@example.com',
            'password' => 'password',
            'role_id' => $managerRole->id,
            'BC' => 'HQ',
        ]);

        Sanctum::actingAs($manager);
        $this->getJson('/api/v1/users')->assertForbidden();
        $this->getJson('/api/v1/roles')->assertForbidden();

        $adminRole = Role::create([
            'name' => Role::SUPER_ADMIN,
            'description' => 'Administrator',
        ]);

        $admin = User::create([
            'username' => 'admin',
            'email' => 'admin@example.com',
            'password' => 'password',
            'role_id' => $adminRole->id,
            'BC' => 'HQ',
        ]);

        Sanctum::actingAs($admin);
        $this->getJson('/api/v1/users')->assertOk();
        $this->getJson('/api/v1/roles')->assertOk();
    }
}
