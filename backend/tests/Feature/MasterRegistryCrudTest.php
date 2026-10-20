<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\MArea;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MasterRegistryCrudTest extends TestCase
{
    use RefreshDatabase;

    private User $hqAdmin;
    private User $branchAdmin;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::create([
            'name' => Role::SUPER_ADMIN,
            'description' => 'Test administrator',
        ]);

        $this->hqAdmin = User::create([
            'username' => 'hq-admin',
            'email' => 'hq@example.com',
            'password' => 'password',
            'role_id' => $role->id,
            'BC' => 'HQ',
        ]);

        $this->branchAdmin = User::create([
            'username' => 'branch-admin',
            'email' => 'branch@example.com',
            'password' => 'password',
            'role_id' => $role->id,
            'BC' => 'BR02',
        ]);
    }

    public function test_branch_scoped_crud_does_not_expose_other_branch_records(): void
    {
        $hqDepartment = \App\Models\Department::create([
            'name' => 'HQ Sales',
            'BC' => 'HQ',
            'UID' => 'hq-admin',
        ]);

        \App\Models\Department::create([
            'name' => 'Branch Sales',
            'BC' => 'BR02',
            'UID' => 'branch-admin',
        ]);

        Sanctum::actingAs($this->branchAdmin);

        $this->getJson('/api/v1/departments')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'Branch Sales');

        $this->getJson("/api/v1/departments/{$hqDepartment->id}")
            ->assertNotFound();

        $this->putJson("/api/v1/departments/{$hqDepartment->id}", [
            'name' => 'Changed',
        ])->assertNotFound();

        $this->deleteJson("/api/v1/departments/{$hqDepartment->id}")
            ->assertNotFound();
    }

    public function test_category_hierarchy_prevents_cycles_and_unsafe_delete(): void
    {
        Sanctum::actingAs($this->hqAdmin);

        $parent = Category::create([
            'name' => 'Electronics',
            'parent_id' => null,
            'BC' => 'HQ',
            'UID' => 'hq-admin',
        ]);

        $child = Category::create([
            'name' => 'Mobile Phones',
            'parent_id' => $parent->id,
            'BC' => 'HQ',
            'UID' => 'hq-admin',
        ]);

        $this->putJson("/api/v1/categories/{$parent->id}", [
            'parent_id' => $child->id,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('parent_id');

        $this->deleteJson("/api/v1/categories/{$parent->id}")
            ->assertUnprocessable()
            ->assertJsonPath(
                'message',
                'Move or delete the subcategories before deleting this category.'
            );

        $this->getJson('/api/v1/categories')
            ->assertOk()
            ->assertJsonPath('data.1.parent.name', 'Electronics')
            ->assertJsonPath('data.0.children_count', 1);
    }

    public function test_route_must_reference_an_area_in_the_same_branch(): void
    {
        $otherBranchArea = MArea::create([
            'name' => 'Remote Area',
            'BC' => 'BR02',
            'UID' => 'branch-admin',
        ]);

        Sanctum::actingAs($this->hqAdmin);

        $this->postJson('/api/v1/routes', [
            'name' => 'Invalid Route',
            'area_id' => $otherBranchArea->id,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('area_id');

        $hqArea = MArea::create([
            'name' => 'Colombo',
            'BC' => 'HQ',
            'UID' => 'hq-admin',
        ]);

        $this->postJson('/api/v1/routes', [
            'name' => 'Route 01',
            'area_id' => $hqArea->id,
        ])->assertCreated()
            ->assertJsonPath('data.area.name', 'Colombo');
    }

    public function test_update_can_keep_unique_value_and_duplicate_siblings_are_rejected(): void
    {
        Sanctum::actingAs($this->hqAdmin);

        $department = \App\Models\Department::create([
            'name' => 'Sales',
            'BC' => 'HQ',
            'UID' => 'hq-admin',
        ]);

        $this->putJson("/api/v1/departments/{$department->id}", [
            'name' => 'Sales',
        ])->assertOk();

        $this->postJson('/api/v1/departments', [
            'name' => 'Sales',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('name');
    }
}
