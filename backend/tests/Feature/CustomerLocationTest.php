<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CustomerLocationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $role = Role::create(['name' => Role::SUPER_ADMIN, 'description' => 'Test admin']);
        Sanctum::actingAs(User::create([
            'username' => 'location-admin', 'email' => 'location@example.com',
            'password' => 'password', 'role_id' => $role->id, 'BC' => 'HQ',
        ]));
    }

    public function test_customer_location_can_be_saved_updated_and_cleared(): void
    {
        $response = $this->postJson('/api/v1/customers', [
            'name' => 'Delivery customer', 'latitude' => 6.9271, 'longitude' => 79.8612,
            'location_note' => 'Blue gate',
        ])->assertSuccessful();
        $id = $response->json('data.id');
        $this->assertNotNull($id);
        $this->getJson("/api/v1/customers/{$id}")->assertOk()->assertJsonPath('data.location_note', 'Blue gate');
        $this->putJson("/api/v1/customers/{$id}", ['name' => 'Renamed customer'])->assertSuccessful();
        $this->assertEquals(6.9271, Customer::findOrFail($id)->latitude);
        $this->putJson("/api/v1/customers/{$id}", ['latitude' => 7.1, 'longitude' => 80.1])->assertSuccessful();
        $this->putJson("/api/v1/customers/{$id}", ['latitude' => null, 'longitude' => null])->assertSuccessful();
        $this->assertNull(Customer::findOrFail($id)->latitude);
        $this->assertNull(Customer::findOrFail($id)->longitude);
    }

    public function test_location_requires_a_valid_pair_and_is_optional(): void
    {
        $this->postJson('/api/v1/customers', ['name' => 'No location'])->assertSuccessful();
        foreach ([['latitude' => 6], ['longitude' => 80], ['latitude' => 91, 'longitude' => 80], ['latitude' => 6, 'longitude' => 181]] as $location) {
            $this->postJson('/api/v1/customers', ['name' => 'Invalid location', ...$location])->assertUnprocessable();
        }
    }
}
