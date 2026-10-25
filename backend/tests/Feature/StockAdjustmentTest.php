<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\ItemBatch;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\StockAdjustment;
use App\Models\Store;
use App\Models\TItemMovement;
use App\Models\TItemSerialMovement;
use App\Models\User;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class StockAdjustmentTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Store $store;

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

        $this->store = Store::create([
            'name' => 'Store A',
            'location' => 'Ground Floor',
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        Sanctum::actingAs($this->user);
    }

    private function createItem(string $code, bool $batch = false, bool $serialized = false): Item
    {
        return Item::create([
            'item_code' => $code,
            'item_description' => "Item {$code}",
            'is_batch' => $batch,
            'is_serialized' => $serialized,
            'reorder_level' => 0,
            'standard_purchase_price' => 100,
            'standard_sales_price' => 150,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);
    }

    private function receive(string $code, int $qty, ?string $batchNo = null, ?array $serials = null): void
    {
        app(StockService::class)->receiveStock(
            'OPS-TEST-'.$code,
            'OPS',
            $code,
            $batchNo,
            $this->store->id,
            $qty,
            100,
            150,
            'HQ',
            'admin',
            $serials
        );
    }

    private function payload(array $overrides = []): array
    {
        return array_merge([
            'store_id' => $this->store->id,
            'reason' => 'COUNT_CORRECTION',
            'note' => 'Physical stock count',
        ], $overrides);
    }

    public function test_decrease_posts_adj_movement_and_writes_audit_log(): void
    {
        $this->createItem('ITM1');
        $this->receive('ITM1', 10);

        $this->postJson('/api/v1/stock-adjustments', $this->payload([
            'item_code' => 'ITM1',
            'current_qty' => 10,
            'new_qty' => 7,
            'reason' => 'DAMAGED',
            'note' => 'Three units water damaged',
        ]))
            ->assertCreated()
            ->assertJsonPath('data.old_qty', 10)
            ->assertJsonPath('data.new_qty', 7)
            ->assertJsonPath('data.diff_qty', -3);

        $movement = TItemMovement::where('trans_code', 'ADJ')->sole();
        $this->assertSame(0, (int) $movement->qun_in);
        $this->assertSame(3, (int) $movement->qun_out);
        $this->assertSame('admin', $movement->UID);

        $this->assertDatabaseHas('stock_adjustments', [
            'item_code' => 'ITM1',
            'old_qty' => 10,
            'new_qty' => 7,
            'diff_qty' => -3,
            'reason' => 'DAMAGED',
            'note' => 'Three units water damaged',
            'UID' => 'admin',
            'BC' => 'HQ',
        ]);

        $this->getJson('/api/v1/stock-adjustments')
            ->assertOk()
            ->assertJsonPath('data.0.item_description', 'Item ITM1')
            ->assertJsonPath('data.0.store_name', 'Store A')
            ->assertJsonPath('meta.total', 1);
    }

    public function test_increase_posts_stock_in(): void
    {
        $this->createItem('ITM2');
        $this->receive('ITM2', 2);

        $this->postJson('/api/v1/stock-adjustments', $this->payload([
            'item_code' => 'ITM2',
            'current_qty' => 2,
            'new_qty' => 5,
            'reason' => 'FOUND',
        ]))->assertCreated();

        $this->getJson('/api/v1/stock')->assertJsonPath('data.0.total_qty', 5);
    }

    public function test_batch_adjustment_updates_qty_in_hand(): void
    {
        $this->createItem('ITM3', batch: true);
        $this->receive('ITM3', 8, 'B1');

        $this->postJson('/api/v1/stock-adjustments', $this->payload([
            'item_code' => 'ITM3',
            'batch_no' => 'B1',
            'current_qty' => 8,
            'new_qty' => 6,
        ]))->assertCreated();

        $this->assertSame(6, ItemBatch::where('batch_no', 'B1')->value('qty_in_hand'));
    }

    public function test_serialized_adjustment_requires_matching_serials(): void
    {
        $this->createItem('ITM4', serialized: true);
        $this->receive('ITM4', 2, null, ['SN1', 'SN2']);

        $this->postJson('/api/v1/stock-adjustments', $this->payload([
            'item_code' => 'ITM4',
            'current_qty' => 2,
            'new_qty' => 1,
        ]))->assertStatus(422);

        $this->postJson('/api/v1/stock-adjustments', $this->payload([
            'item_code' => 'ITM4',
            'current_qty' => 2,
            'new_qty' => 1,
            'reason' => 'LOST',
            'serial_numbers' => ['SN2'],
        ]))->assertCreated();

        $this->assertDatabaseHas('t_item_serial_movements', [
            'trans_code' => 'ADJ',
            'item_serial_no' => 'SN2',
            'qun_out' => 1,
        ]);
        $this->assertSame(['SN2'], StockAdjustment::sole()->serial_numbers);
    }

    public function test_reason_and_note_are_required(): void
    {
        $this->createItem('ITM5');

        $this->postJson('/api/v1/stock-adjustments', [
            'item_code' => 'ITM5',
            'store_id' => $this->store->id,
            'current_qty' => 0,
            'new_qty' => 1,
        ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['reason', 'note']);

        $this->assertSame(0, StockAdjustment::count());
    }

    public function test_stale_current_qty_is_rejected_without_changes(): void
    {
        $this->createItem('ITM6');
        $this->receive('ITM6', 4);

        $this->postJson('/api/v1/stock-adjustments', $this->payload([
            'item_code' => 'ITM6',
            'current_qty' => 3,
            'new_qty' => 1,
        ]))->assertStatus(422);

        $this->assertSame(0, TItemMovement::where('trans_code', 'ADJ')->count());
        $this->assertSame(0, StockAdjustment::count());
        $this->assertSame(0, TItemSerialMovement::where('trans_code', 'ADJ')->count());
    }

    public function test_no_change_is_rejected(): void
    {
        $this->createItem('ITM7');
        $this->receive('ITM7', 4);

        $this->postJson('/api/v1/stock-adjustments', $this->payload([
            'item_code' => 'ITM7',
            'current_qty' => 4,
            'new_qty' => 4,
        ]))->assertStatus(422);
    }

    public function test_requires_stock_adjustment_permission(): void
    {
        $role = Role::create(['name' => 'Cashier', 'description' => 'Cashier']);
        RolePermission::create([
            'role_id' => $role->id,
            'module' => 'items',
            'can_create' => true,
            'can_read' => true,
            'can_update' => true,
            'can_delete' => false,
            'BC' => 'HQ',
            'UID' => 'system',
        ]);
        $cashier = User::create([
            'username' => 'cashier',
            'email' => 'cashier@example.com',
            'password' => 'password',
            'role_id' => $role->id,
            'BC' => 'HQ',
        ]);
        Sanctum::actingAs($cashier);

        $this->getJson('/api/v1/stock-adjustments')->assertForbidden();
        $this->postJson('/api/v1/stock-adjustments', [])->assertForbidden();
    }
}
