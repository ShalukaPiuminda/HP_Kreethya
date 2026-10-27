<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\ItemBatch;
use App\Models\PriceRevision;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\Store;
use App\Models\User;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PriceRevisionTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Store $storeA;
    private Store $storeB;
    private Item $item;
    private ItemBatch $batchA1;
    private ItemBatch $batchA2;
    private ItemBatch $batchB1;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::create(['name' => 'Super Admin', 'description' => 'Test administrator']);
        $this->admin = User::create([
            'username' => 'admin',
            'email' => 'admin@example.com',
            'password' => 'password',
            'role_id' => $role->id,
            'BC' => 'HQ',
        ]);

        $this->storeA = Store::create(['name' => 'Store A', 'location' => 'Ground', 'BC' => 'HQ', 'UID' => 'admin']);
        $this->storeB = Store::create(['name' => 'Store B', 'location' => 'Warehouse', 'BC' => 'HQ', 'UID' => 'admin']);

        $this->item = Item::create([
            'item_code' => 'TV001',
            'item_description' => 'LED TV',
            'is_batch' => true,
            'is_serialized' => false,
            'reorder_level' => 0,
            'standard_purchase_price' => 80000,
            'standard_sales_price' => 100000,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        $this->batchA1 = $this->batch('B1', $this->storeA, 80000, 100000, 5);
        $this->batchA2 = $this->batch('B2', $this->storeA, 82000, 102000, 3);
        $this->batchB1 = $this->batch('B1', $this->storeB, 80000, 100000, 2);

        Sanctum::actingAs($this->admin);
    }

    public function test_selected_batches_get_new_sales_price_and_history_records_who_changed_it(): void
    {
        $this->postJson('/api/v1/price-revisions', [
            'item_code' => 'TV001',
            'scope' => 'selected',
            'batch_ids' => [$this->batchA1->id],
            'price_type' => 'sales',
            'method' => 'set',
            'sales_value' => 110000,
            'reason' => 'Supplier price increase',
        ])->assertCreated()
            ->assertJsonPath('data.UID', 'admin')
            ->assertJsonPath('data.source', 'manual')
            ->assertJsonCount(1, 'data.lines');

        $this->assertSame(110000.0, (float) $this->batchA1->fresh()->sales_price);
        $this->assertSame(80000.0, (float) $this->batchA1->fresh()->purchase_price);
        $this->assertSame(102000.0, (float) $this->batchA2->fresh()->sales_price);
        $this->assertSame(100000.0, (float) $this->batchB1->fresh()->sales_price);

        $this->assertDatabaseHas('price_revision_lines', [
            'item_batch_id' => $this->batchA1->id,
            'old_sales_price' => 100000,
            'new_sales_price' => 110000,
        ]);

        $this->getJson('/api/v1/price-revisions?batch_id='.$this->batchA1->id)
            ->assertOk()
            ->assertJsonPath('data.0.reason', 'Supplier price increase');
    }

    public function test_percentage_change_for_all_batches(): void
    {
        $this->postJson('/api/v1/price-revisions', [
            'item_code' => 'TV001',
            'scope' => 'all',
            'price_type' => 'sales',
            'method' => 'percent',
            'sales_value' => 10,
            'reason' => 'Annual increase',
        ])->assertCreated()->assertJsonCount(3, 'data.lines');

        $this->assertSame(110000.0, (float) $this->batchA1->fresh()->sales_price);
        $this->assertSame(112200.0, (float) $this->batchA2->fresh()->sales_price);
        $this->assertSame(110000.0, (float) $this->batchB1->fresh()->sales_price);
    }

    public function test_batch_items_have_no_standard_price_to_revise(): void
    {
        foreach ([['scope' => 'standard'], ['scope' => 'all', 'update_standard' => true]] as $scope) {
            $this->postJson('/api/v1/price-revisions', [
                'item_code' => 'TV001',
                ...$scope,
                'price_type' => 'sales',
                'method' => 'set',
                'sales_value' => 110000,
                'reason' => 'Standard price',
            ])->assertUnprocessable()->assertJsonValidationErrors('scope');
        }

        $this->assertSame(100000.0, (float) $this->item->fresh()->standard_sales_price);
        $this->assertDatabaseCount('price_revisions', 0);
    }

    public function test_store_scope_only_changes_that_store(): void
    {
        $this->postJson('/api/v1/price-revisions', [
            'item_code' => 'TV001',
            'scope' => 'store',
            'store_id' => $this->storeB->id,
            'price_type' => 'sales',
            'method' => 'amount',
            'sales_value' => -5000,
            'reason' => 'Clearance at warehouse',
        ])->assertCreated();

        $this->assertSame(95000.0, (float) $this->batchB1->fresh()->sales_price);
        $this->assertSame(100000.0, (float) $this->batchA1->fresh()->sales_price);
    }

    public function test_sales_price_below_purchase_price_is_blocked_and_nothing_changes(): void
    {
        $this->postJson('/api/v1/price-revisions', [
            'item_code' => 'TV001',
            'scope' => 'all',
            'price_type' => 'sales',
            'method' => 'set',
            'sales_value' => 81000,
            'reason' => 'Too low',
        ])->assertUnprocessable()->assertJsonValidationErrors('lines');

        $this->assertSame(100000.0, (float) $this->batchA1->fresh()->sales_price);
        $this->assertSame(102000.0, (float) $this->batchA2->fresh()->sales_price);
        $this->assertDatabaseCount('price_revisions', 0);
    }

    public function test_item_min_and_max_sales_price_are_enforced(): void
    {
        $this->item->update(['sales_criteria_enabled' => true, 'min_sales_price' => 90000, 'max_sales_price' => 120000]);

        $this->postJson('/api/v1/price-revisions', [
            'item_code' => 'TV001',
            'scope' => 'selected',
            'batch_ids' => [$this->batchA1->id],
            'price_type' => 'sales',
            'method' => 'set',
            'sales_value' => 125000,
            'reason' => 'Above max',
        ])->assertUnprocessable();

        $this->assertSame(100000.0, (float) $this->batchA1->fresh()->sales_price);
    }

    public function test_preview_shows_errors_without_saving(): void
    {
        $this->postJson('/api/v1/price-revisions/preview', [
            'item_code' => 'TV001',
            'scope' => 'all',
            'price_type' => 'sales',
            'method' => 'set',
            'sales_value' => 81000,
        ])->assertOk()
            ->assertJsonPath('data.can_save', false)
            ->assertJsonCount(3, 'data.lines');

        $this->assertDatabaseCount('price_revisions', 0);
        $this->assertSame(100000.0, (float) $this->batchA1->fresh()->sales_price);
    }

    public function test_other_roles_can_change_sales_price_but_not_purchase_price_or_reverse(): void
    {
        $role = Role::create(['name' => 'Manager', 'description' => 'Manager']);
        RolePermission::create([
            'role_id' => $role->id,
            'module' => 'price-revisions',
            'can_read' => true,
            'can_create' => true,
            'can_update' => false,
            'can_delete' => false,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);
        $manager = User::create([
            'username' => 'manager',
            'email' => 'manager@example.com',
            'password' => 'password',
            'role_id' => $role->id,
            'BC' => 'HQ',
        ]);
        Sanctum::actingAs($manager);

        $revisionId = $this->postJson('/api/v1/price-revisions', [
            'item_code' => 'TV001',
            'scope' => 'selected',
            'batch_ids' => [$this->batchA1->id],
            'price_type' => 'sales',
            'method' => 'set',
            'sales_value' => 105000,
            'reason' => 'Promotion',
        ])->assertCreated()->assertJsonPath('data.UID', 'manager')->json('data.id');

        $this->postJson('/api/v1/price-revisions', [
            'item_code' => 'TV001',
            'scope' => 'selected',
            'batch_ids' => [$this->batchA1->id],
            'price_type' => 'purchase',
            'method' => 'set',
            'purchase_value' => 70000,
            'reason' => 'Cost correction',
        ])->assertForbidden();

        $this->postJson("/api/v1/price-revisions/{$revisionId}/reverse", ['reason' => 'Mistake'])
            ->assertForbidden();

        $this->assertSame(80000.0, (float) $this->batchA1->fresh()->purchase_price);
        $this->assertSame(105000.0, (float) $this->batchA1->fresh()->sales_price);
    }

    public function test_users_without_the_permission_cannot_open_price_revisions(): void
    {
        $role = Role::create(['name' => 'Cashier', 'description' => 'Cashier']);
        Sanctum::actingAs(User::create([
            'username' => 'cashier',
            'email' => 'cashier@example.com',
            'password' => 'password',
            'role_id' => $role->id,
            'BC' => 'HQ',
        ]));

        $this->getJson('/api/v1/price-revisions')->assertForbidden();
    }

    public function test_reversal_restores_old_prices_and_keeps_original_record(): void
    {
        $revisionId = $this->postJson('/api/v1/price-revisions', [
            'item_code' => 'TV001',
            'scope' => 'selected',
            'batch_ids' => [$this->batchA1->id],
            'price_type' => 'both',
            'method' => 'set',
            'purchase_value' => 85000,
            'sales_value' => 115000,
            'reason' => 'Wrong supplier invoice',
        ])->assertCreated()->json('data.id');

        $this->postJson("/api/v1/price-revisions/{$revisionId}/reverse", ['reason' => 'Entered by mistake'])
            ->assertCreated()
            ->assertJsonPath('data.source', 'reversal')
            ->assertJsonPath('data.reverses_id', $revisionId);

        $batch = $this->batchA1->fresh();
        $this->assertSame(80000.0, (float) $batch->purchase_price);
        $this->assertSame(100000.0, (float) $batch->sales_price);

        $original = PriceRevision::find($revisionId);
        $this->assertSame('reversed', $original->status);
        $this->assertSame('admin', $original->reversed_by);

        $this->postJson("/api/v1/price-revisions/{$revisionId}/reverse", ['reason' => 'Again'])
            ->assertUnprocessable();
    }

    public function test_reversal_is_blocked_when_price_changed_again_afterwards(): void
    {
        $first = $this->postJson('/api/v1/price-revisions', [
            'item_code' => 'TV001',
            'scope' => 'selected',
            'batch_ids' => [$this->batchA1->id],
            'price_type' => 'sales',
            'method' => 'set',
            'sales_value' => 105000,
            'reason' => 'First',
        ])->json('data.id');

        $this->postJson('/api/v1/price-revisions', [
            'item_code' => 'TV001',
            'scope' => 'selected',
            'batch_ids' => [$this->batchA1->id],
            'price_type' => 'sales',
            'method' => 'set',
            'sales_value' => 108000,
            'reason' => 'Second',
        ])->assertCreated();

        $this->postJson("/api/v1/price-revisions/{$first}/reverse", ['reason' => 'Undo first'])
            ->assertUnprocessable();

        $this->assertSame(108000.0, (float) $this->batchA1->fresh()->sales_price);
    }

    public function test_non_batch_item_only_allows_standard_price(): void
    {
        Item::create([
            'item_code' => 'FAN001',
            'item_description' => 'Table Fan',
            'is_batch' => false,
            'is_serialized' => false,
            'reorder_level' => 0,
            'standard_purchase_price' => 5000,
            'standard_sales_price' => 7000,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        $this->postJson('/api/v1/price-revisions', [
            'item_code' => 'FAN001',
            'scope' => 'all',
            'price_type' => 'sales',
            'method' => 'set',
            'sales_value' => 7500,
            'reason' => 'x',
        ])->assertUnprocessable();

        $this->postJson('/api/v1/price-revisions', [
            'item_code' => 'FAN001',
            'scope' => 'standard',
            'price_type' => 'sales',
            'method' => 'set',
            'sales_value' => 7500,
            'reason' => 'New price list',
        ])->assertCreated();

        $this->assertSame(7500.0, (float) Item::where('item_code', 'FAN001')->value('standard_sales_price'));
    }

    public function test_returns_and_transfers_into_existing_batch_keep_revised_price(): void
    {
        $this->postJson('/api/v1/price-revisions', [
            'item_code' => 'TV001',
            'scope' => 'selected',
            'batch_ids' => [$this->batchB1->id],
            'price_type' => 'sales',
            'method' => 'set',
            'sales_value' => 99000,
            'reason' => 'Warehouse price',
        ])->assertCreated();

        // Transfer B1 from Store A (100,000) into Store B, whose B1 was revised to 99,000.
        $this->postJson('/api/v1/stock/transfer', [
            'item_code' => 'TV001',
            'batch_no' => 'B1',
            'from_store_id' => $this->storeA->id,
            'to_store_id' => $this->storeB->id,
            'qty' => 1,
        ])->assertCreated();

        $this->assertSame(99000.0, (float) $this->batchB1->fresh()->sales_price);
        $this->assertSame(3, $this->batchB1->fresh()->qty_in_hand);

        // A return brings stock back at the agreement price; the batch price must stay.
        app(StockService::class)->receiveStock('HPR-1', 'HP-RETURN', 'TV001', 'B1', $this->storeB->id, 1, 80000, 100000, 'HQ', 'admin');

        $this->assertSame(99000.0, (float) $this->batchB1->fresh()->sales_price);
        $this->assertSame(1, PriceRevision::count());
    }

    public function test_grn_into_existing_batch_updates_price_and_logs_revision(): void
    {
        app(StockService::class)->receiveStock('GRN-HQ-1', 'GRN', 'TV001', 'B1', $this->storeA->id, 2, 83000, 104000, 'HQ', 'admin');

        $batch = $this->batchA1->fresh();
        $this->assertSame(83000.0, (float) $batch->purchase_price);
        $this->assertSame(104000.0, (float) $batch->sales_price);
        $this->assertSame(7, $batch->qty_in_hand);

        $this->assertDatabaseHas('price_revisions', ['source' => 'GRN', 'source_no' => 'GRN-HQ-1', 'price_type' => 'both']);
        $this->assertDatabaseHas('price_revision_lines', [
            'item_batch_id' => $this->batchA1->id,
            'old_sales_price' => 100000,
            'new_sales_price' => 104000,
        ]);

        // Same price again: no new revision.
        app(StockService::class)->receiveStock('GRN-HQ-2', 'GRN', 'TV001', 'B1', $this->storeA->id, 1, 83000, 104000, 'HQ', 'admin');
        $this->assertSame(1, PriceRevision::count());
    }

    private function batch(string $batchNo, Store $store, float $purchase, float $sales, int $qty): ItemBatch
    {
        return ItemBatch::create([
            'batch_no' => $batchNo,
            'item_code' => 'TV001',
            'store_id' => $store->id,
            'purchase_price' => $purchase,
            'sales_price' => $sales,
            'qty_in_hand' => $qty,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);
    }
}
