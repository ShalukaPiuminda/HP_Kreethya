<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ItemBarcodeTest extends TestCase
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

    private function itemPayload(array $overrides = []): array
    {
        return [
            'item_description' => 'Test TV',
            'standard_purchase_price' => 100,
            'standard_sales_price' => 150,
            ...$overrides,
        ];
    }

    public function test_barcode_is_normalized_and_keeps_leading_zeros(): void
    {
        Sanctum::actingAs($this->hqAdmin);

        $response = $this->postJson('/api/v1/items', $this->itemPayload([
            'barcode' => "  0012345678905\r\n",
        ]))->assertCreated();

        $response->assertJsonPath('data.barcode', '0012345678905');
        $this->assertSame('0012345678905', Item::first()->barcode);

        $this->getJson('/api/v1/items?search=00123456')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.barcode', '0012345678905');
    }

    public function test_items_without_barcode_still_work_and_blank_is_stored_as_null(): void
    {
        Sanctum::actingAs($this->hqAdmin);

        $this->postJson('/api/v1/items', $this->itemPayload())->assertCreated();
        $this->postJson('/api/v1/items', $this->itemPayload(['barcode' => '   ']))->assertCreated();
        $this->postJson('/api/v1/items', $this->itemPayload(['barcode' => null]))->assertCreated();

        $this->assertSame(3, Item::whereNull('barcode')->count());
    }

    public function test_duplicate_barcode_is_rejected_in_same_branch_but_allowed_in_another(): void
    {
        Sanctum::actingAs($this->hqAdmin);
        $this->postJson('/api/v1/items', $this->itemPayload(['barcode' => '4006381333931']))->assertCreated();

        $this->postJson('/api/v1/items', $this->itemPayload(['barcode' => '4006381333931']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('barcode');

        Sanctum::actingAs($this->branchAdmin);
        $this->postJson('/api/v1/items', $this->itemPayload(['barcode' => '4006381333931']))->assertCreated();
    }

    public function test_upc_a_and_its_ean_13_form_count_as_the_same_barcode(): void
    {
        Sanctum::actingAs($this->hqAdmin);
        $this->postJson('/api/v1/items', $this->itemPayload(['barcode' => '036000291452']))->assertCreated();

        $this->postJson('/api/v1/items', $this->itemPayload(['barcode' => '0036000291452']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('barcode');
    }

    public function test_invalid_check_digit_is_rejected_and_code_128_text_is_accepted(): void
    {
        Sanctum::actingAs($this->hqAdmin);

        $this->postJson('/api/v1/items', $this->itemPayload(['barcode' => '4006381333932']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('barcode');

        $this->postJson('/api/v1/items', $this->itemPayload(['barcode' => 'abc 123']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('barcode');

        $this->postJson('/api/v1/items', $this->itemPayload(['barcode' => 'SHOP-00042']))
            ->assertCreated()
            ->assertJsonPath('data.barcode', 'SHOP-00042');
    }

    public function test_barcode_cannot_be_another_items_code(): void
    {
        Sanctum::actingAs($this->hqAdmin);
        $first = $this->postJson('/api/v1/items', $this->itemPayload())->assertCreated();

        $this->postJson('/api/v1/items', $this->itemPayload([
            'barcode' => $first->json('data.item_code'),
        ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('barcode');
    }

    public function test_editing_keeps_own_barcode_changes_it_and_clears_it(): void
    {
        Sanctum::actingAs($this->hqAdmin);
        $id = $this->postJson('/api/v1/items', $this->itemPayload(['barcode' => '4006381333931']))
            ->assertCreated()
            ->json('data.id');

        $this->putJson("/api/v1/items/{$id}", $this->itemPayload(['barcode' => '4006381333931']))
            ->assertOk()
            ->assertJsonPath('data.barcode', '4006381333931');

        // Omitting the field leaves the stored barcode alone.
        $this->putJson("/api/v1/items/{$id}", ['item_description' => 'Renamed TV'])
            ->assertOk()
            ->assertJsonPath('data.barcode', '4006381333931');

        $this->putJson("/api/v1/items/{$id}", $this->itemPayload(['barcode' => '']))
            ->assertOk()
            ->assertJsonPath('data.barcode', null);
    }

    public function test_stock_snapshot_includes_barcode_and_is_branch_scoped(): void
    {
        Sanctum::actingAs($this->hqAdmin);
        $this->postJson('/api/v1/items', $this->itemPayload(['barcode' => '4006381333931']))->assertCreated();

        $this->getJson('/api/v1/stock?search=4006381333931')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.barcode', '4006381333931');

        Sanctum::actingAs($this->branchAdmin);
        $this->getJson('/api/v1/stock?search=4006381333931')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }
}
