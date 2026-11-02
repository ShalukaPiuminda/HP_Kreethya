<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\RolePermission;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as ClientRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Http;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class HelpDeskTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::create(['name' => 'Manager', 'description' => 'Test role']);
        $this->grant($role, canRead: true, canCreate: true);

        $this->user = $this->makeUser('manager1', $role);

        config([
            'services.task_manager.url' => 'https://tasks.example.test/api',
            'services.task_manager.key' => 'tmk_test',
        ]);
    }

    public function test_store_forwards_request_with_key_user_details_and_files(): void
    {
        Http::fake([
            'tasks.example.test/api/integration/requests' => Http::response([
                'data' => ['id' => 7, 'progress' => 'Pending Review'],
                'message' => 'Request submitted.',
            ], 201),
        ]);
        Sanctum::actingAs($this->user);

        $response = $this->post('/api/v1/help-desk/requests', [
            'title' => 'Invoice total wrong',
            'task_type' => 'Error',
            'priority' => 'Urgent',
            'description' => 'VAT added twice.',
            'page_url' => '/dashboard/sales',
            'files' => [UploadedFile::fake()->image('screen.png')],
        ], ['Accept' => 'application/json']);

        $response->assertCreated()
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.progress', 'Pending Review');

        Http::assertSent(function (ClientRequest $request) {
            $fields = collect($request->data())->pluck('contents', 'name');

            return $request->hasHeader('X-Api-Key', 'tmk_test')
                && $request->isMultipart()
                && $fields['title'] === 'Invoice total wrong'
                && $fields['requester_name'] === 'manager1 (BR02)'
                && $fields['requester_email'] === 'manager1@example.com'
                && $fields->has('files[]');
        });
    }

    public function test_index_returns_task_manager_requests(): void
    {
        Http::fake([
            'tasks.example.test/api/integration/requests' => Http::response([
                'data' => [['id' => 7, 'title' => 'Invoice total wrong', 'progress' => 'Assigned']],
            ]),
        ]);
        Sanctum::actingAs($this->user);

        $this->getJson('/api/v1/help-desk/requests')
            ->assertOk()
            ->assertJsonPath('data.0.progress', 'Assigned');
    }

    public function test_validation_errors_from_task_manager_are_passed_through(): void
    {
        Http::fake([
            '*' => Http::response(['message' => 'The selected task type is invalid.', 'errors' => ['task_type' => ['The selected task type is invalid.']]], 422),
        ]);
        Sanctum::actingAs($this->user);

        $this->postJson('/api/v1/help-desk/requests', [
            'title' => 'x', 'task_type' => 'Bogus', 'description' => 'y',
        ])->assertStatus(422)->assertJsonPath('errors.task_type.0', 'The selected task type is invalid.');
    }

    public function test_unconfigured_help_desk_returns_friendly_error(): void
    {
        config(['services.task_manager.key' => null]);
        Http::fake();
        Sanctum::actingAs($this->user);

        $this->getJson('/api/v1/help-desk/requests')->assertStatus(503);
        Http::assertNothingSent();
    }

    public function test_guests_cannot_use_the_help_desk(): void
    {
        $this->getJson('/api/v1/help-desk/requests')->assertUnauthorized();
    }

    public function test_roles_without_help_desk_permission_are_blocked(): void
    {
        Http::fake();
        $cashier = $this->makeUser('cashier1', Role::create(['name' => 'Cashier', 'description' => 'Test role']));
        Sanctum::actingAs($cashier);

        $this->getJson('/api/v1/help-desk/requests')->assertForbidden();
        $this->postJson('/api/v1/help-desk/requests', $this->validPayload())->assertForbidden();

        Http::assertNothingSent();
    }

    public function test_view_only_role_can_list_but_not_submit(): void
    {
        Http::fake([
            'tasks.example.test/api/integration/requests' => Http::response(['data' => []]),
        ]);
        $role = Role::create(['name' => 'Accountant', 'description' => 'Test role']);
        $this->grant($role, canRead: true, canCreate: false);
        Sanctum::actingAs($this->makeUser('accountant1', $role));

        $this->getJson('/api/v1/help-desk/requests')->assertOk();
        $this->postJson('/api/v1/help-desk/requests', $this->validPayload())->assertForbidden();
    }

    public function test_super_admin_can_submit_without_explicit_permission(): void
    {
        Http::fake([
            'tasks.example.test/api/integration/requests' => Http::response(['data' => ['id' => 9]], 201),
        ]);
        $admin = $this->makeUser('admin1', Role::create(['name' => Role::SUPER_ADMIN, 'description' => 'Test role']));
        Sanctum::actingAs($admin);

        $this->postJson('/api/v1/help-desk/requests', $this->validPayload())->assertCreated();
    }

    private function validPayload(): array
    {
        return [
            'title' => 'Report not loading',
            'task_type' => 'Error',
            'priority' => 'Normal',
            'description' => 'The daily sales report spins forever.',
        ];
    }

    private function makeUser(string $username, Role $role): User
    {
        return User::create([
            'username' => $username,
            'email' => "{$username}@example.com",
            'password' => 'password',
            'role_id' => $role->id,
            'BC' => 'BR02',
        ]);
    }

    private function grant(Role $role, bool $canRead, bool $canCreate): void
    {
        RolePermission::create([
            'role_id' => $role->id,
            'module' => 'help-desk',
            'can_read' => $canRead,
            'can_create' => $canCreate,
            'can_update' => false,
            'can_delete' => false,
            'BC' => 'HQ',
            'UID' => 'test',
        ]);
    }
}
