<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\ItemBatch;
use App\Models\Role;
use App\Models\Store;
use App\Models\TItemMovement;
use App\Models\TItemSerialMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StockManagementTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Store $storeA;
    private Store $storeB;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::create([
            'name' => 'Super Admin',
            'description' => 'Test administrator',
        ]);

        $this->user = User::create([
            'username' => 'admin',
            'email' => 'admin@example.com',
            'password' => 'password',
            'role_id' => $role->id,
            'BC' => 'HQ',
        ]);

        $this->storeA = Store::create([
            'name' => 'Store A',
            'location' => 'Ground Floor',
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        $this->storeB = Store::create([
            'name' => 'Store B',
            'location' => 'Warehouse',
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        Sanctum::actingAs($this->user);
    }

    public function test_reorder_route_returns_alerts_instead_of_matching_item_route(): void
    {
        Item::create([
            'item_code' => 'ITM0001',
            'item_description' => 'Low Stock Item',
            'is_batch' => false,
            'is_serialized' => false,
            'reorder_level' => 5,
            'standard_purchase_price' => 100,
            'standard_sales_price' => 150,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        $this->getJson('/api/v1/stock/reorder-alerts')
            ->assertOk()
            ->assertJsonPath('data.0.item_code', 'ITM0001')
            ->assertJsonPath('data.0.current_stock', 0)
            ->assertJsonPath('data.0.deficit', 5);
    }

    public function test_batch_stock_summary_contains_store_prices_and_quantities(): void
    {
        $item = Item::create([
            'item_code' => 'ITM0002',
            'item_description' => 'Batch Item',
            'is_batch' => true,
            'is_serialized' => false,
            'reorder_level' => 2,
            'standard_purchase_price' => 0,
            'standard_sales_price' => 0,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        ItemBatch::create([
            'batch_no' => 'BATCH-A',
            'item_code' => $item->item_code,
            'store_id' => $this->storeA->id,
            'purchase_price' => 1000,
            'sales_price' => 1250,
            'qty_in_hand' => 3,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        $this->getJson('/api/v1/stock')
            ->assertOk()
            ->assertJsonPath('data.0.total_qty', 3)
            ->assertJsonPath('data.0.stock_value', 3000)
            ->assertJsonPath('data.0.batches.0.batch_no', 'BATCH-A')
            ->assertJsonPath('data.0.batches.0.sales_price', 1250)
            ->assertJsonPath('data.0.stores.0.store_name', 'Store A');
    }

    public function test_non_batch_transfer_cannot_overdraw_source_store(): void
    {
        $item = Item::create([
            'item_code' => 'ITM0003',
            'item_description' => 'Standard Item',
            'is_batch' => false,
            'is_serialized' => false,
            'reorder_level' => 0,
            'standard_purchase_price' => 500,
            'standard_sales_price' => 650,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        TItemMovement::create([
            'trans_no' => 'OPS-HQ-1',
            'dDate' => now(),
            'trans_code' => 'OPS',
            'item_code' => $item->item_code,
            'store_id' => $this->storeA->id,
            'qun_in' => 2,
            'qun_out' => 0,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        $this->postJson('/api/v1/stock/transfer', [
            'item_code' => $item->item_code,
            'from_store_id' => $this->storeA->id,
            'to_store_id' => $this->storeB->id,
            'qty' => 3,
        ])->assertUnprocessable()
            ->assertJsonPath('message', 'Insufficient stock. Available: 2, requested: 3');
    }

    public function test_batch_transfer_preserves_purchase_and_sales_prices(): void
    {
        $item = Item::create([
            'item_code' => 'ITM0004',
            'item_description' => 'Transfer Batch Item',
            'is_batch' => true,
            'is_serialized' => false,
            'reorder_level' => 0,
            'standard_purchase_price' => 0,
            'standard_sales_price' => 0,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        ItemBatch::create([
            'batch_no' => 'BATCH-T',
            'item_code' => $item->item_code,
            'store_id' => $this->storeA->id,
            'purchase_price' => 725,
            'sales_price' => 995,
            'qty_in_hand' => 5,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        $this->postJson('/api/v1/stock/transfer', [
            'item_code' => $item->item_code,
            'batch_no' => 'BATCH-T',
            'from_store_id' => $this->storeA->id,
            'to_store_id' => $this->storeB->id,
            'qty' => 2,
        ])->assertCreated();

        $this->assertDatabaseHas('item_batches', [
            'batch_no' => 'BATCH-T',
            'item_code' => $item->item_code,
            'store_id' => $this->storeA->id,
            'purchase_price' => 725,
            'sales_price' => 995,
            'qty_in_hand' => 3,
        ]);

        $this->assertDatabaseHas('item_batches', [
            'batch_no' => 'BATCH-T',
            'item_code' => $item->item_code,
            'store_id' => $this->storeB->id,
            'purchase_price' => 725,
            'sales_price' => 995,
            'qty_in_hand' => 2,
        ]);
    }

    public function test_opening_stock_serials_can_be_edited_while_available(): void
    {
        $item = Item::create([
            'item_code' => 'ITM-SERIAL',
            'item_description' => 'Serialized Item',
            'is_batch' => false,
            'is_serialized' => true,
            'reorder_level' => 0,
            'standard_purchase_price' => 100,
            'standard_sales_price' => 150,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        $response = $this->postJson('/api/v1/stock/receive', [
            'item_code' => $item->item_code,
            'store_id' => $this->storeA->id,
            'qty' => 2,
            'purchase_price' => 100,
            'sales_price' => 150,
            'serial_numbers' => ['OLD-001', 'OLD-002'],
        ])->assertCreated();

        $transNo = $response->json('data.trans_no');

        $this->patchJson("/api/v1/stock/opening-serials/{$transNo}", [
            'item_code' => $item->item_code,
            'store_id' => $this->storeA->id,
            'serial_numbers' => ['NEW-001', 'NEW-002'],
        ])->assertOk()
            ->assertJsonPath('data.serial_numbers.0', 'NEW-001');

        $this->assertDatabaseMissing('t_item_serial_movements', [
            'trans_no' => $transNo,
            'item_serial_no' => 'OLD-001',
        ]);
        $this->assertDatabaseHas('t_item_serial_movements', [
            'trans_no' => $transNo,
            'item_serial_no' => 'NEW-001',
            'qun_in' => 1,
            'qun_out' => 0,
        ]);
        $this->assertDatabaseHas('serial_edit_audits', [
            'source_type' => 'OPS',
            'source_no' => $transNo,
            'item_code' => $item->item_code,
            'old_serial_no' => 'OLD-001',
            'new_serial_no' => 'NEW-001',
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);
    }

    public function test_opening_stock_serials_cannot_be_edited_after_they_leave_store(): void
    {
        $item = Item::create([
            'item_code' => 'ITM-SERIAL-BLOCK',
            'item_description' => 'Serialized Block Item',
            'is_batch' => false,
            'is_serialized' => true,
            'reorder_level' => 0,
            'standard_purchase_price' => 100,
            'standard_sales_price' => 150,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        TItemMovement::create([
            'trans_no' => 'OPS-HQ-BLOCK',
            'dDate' => now(),
            'trans_code' => 'OPS',
            'item_code' => $item->item_code,
            'store_id' => $this->storeA->id,
            'qun_in' => 1,
            'qun_out' => 0,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);
        TItemSerialMovement::create([
            'trans_no' => 'OPS-HQ-BLOCK',
            'trans_code' => 'OPS',
            'item_code' => $item->item_code,
            'item_description' => $item->item_description,
            'item_serial_no' => 'LOCKED-001',
            'qun_in' => 1,
            'qun_out' => 0,
            'store_id' => $this->storeA->id,
            'dDate' => now(),
            'bc' => 'HQ',
            'UID' => 'admin',
        ]);
        TItemSerialMovement::create([
            'trans_no' => 'SALE-HQ-BLOCK',
            'trans_code' => 'SALE',
            'item_code' => $item->item_code,
            'item_description' => $item->item_description,
            'item_serial_no' => 'LOCKED-001',
            'qun_in' => 0,
            'qun_out' => 1,
            'store_id' => $this->storeA->id,
            'dDate' => now(),
            'bc' => 'HQ',
            'UID' => 'admin',
        ]);

        $this->patchJson('/api/v1/stock/opening-serials/OPS-HQ-BLOCK', [
            'item_code' => $item->item_code,
            'store_id' => $this->storeA->id,
            'serial_numbers' => ['NEW-LOCKED-001'],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('serial_numbers');
    }
}
