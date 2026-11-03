<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\Role;
use App\Models\Store;
use App\Models\Supplier;
use App\Models\TPurchasesDetail;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class BarcodePrintTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::create([
            'name' => Role::SUPER_ADMIN,
            'description' => 'Test administrator',
        ]);

        $this->user = User::create([
            'username' => 'admin',
            'email' => 'admin@example.com',
            'password' => 'password',
            'role_id' => $role->id,
            'BC' => 'HQ',
        ]);

        Sanctum::actingAs($this->user);
    }

    private function postGrn(string $branchCode = 'HQ'): void
    {
        $supplier = Supplier::create([
            'Code' => "SUP-{$branchCode}",
            'name' => "Supplier {$branchCode}",
            'phone' => '0112000000',
            'address' => 'Colombo',
            'type' => 'normal',
            'BC' => $branchCode,
            'UID' => 'admin',
        ]);

        $store = Store::create([
            'name' => "Store {$branchCode}",
            'location' => $branchCode,
            'BC' => $branchCode,
            'UID' => 'admin',
        ]);

        foreach (['ITM-A', 'ITM-B'] as $code) {
            Item::create([
                'item_code' => $code,
                'item_description' => "Item {$code}",
                'is_batch' => false,
                'is_serialized' => false,
                'reorder_level' => 0,
                'standard_purchase_price' => 100,
                'standard_sales_price' => 150,
                'BC' => $branchCode,
                'UID' => 'admin',
            ]);
        }

        $this->postJson('/api/v1/purchase-receipts', [
            'invoice_date' => '2026-11-03',
            'supplier_code' => $supplier->Code,
            'store_id' => $store->id,
            'items' => [
                ['item_code' => 'ITM-A', 'qty' => 3, 'unit_price' => 100],
                ['item_code' => 'ITM-B', 'qty' => 2, 'unit_price' => 100],
            ],
        ])->assertCreated();
    }

    public function test_grn_lines_move_between_pending_and_printed(): void
    {
        $this->postGrn();

        $pending = $this->getJson('/api/v1/barcode-prints')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.counts.pending', 2)
            ->assertJsonPath('meta.counts.printed', 0);

        $lineId = $pending->json('data.0.id');

        $this->postJson('/api/v1/barcode-prints/mark', [
            'lines' => [['detail_id' => $lineId, 'labels' => 3]],
        ])->assertOk()->assertJsonPath('data.updated', 1);

        $this->getJson('/api/v1/barcode-prints?status=printed')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $lineId)
            ->assertJsonPath('data.0.barcode_printed_qty', 3)
            ->assertJsonPath('data.0.barcode_print_count', 1)
            ->assertJsonPath('data.0.barcode_printed_by', 'admin')
            ->assertJsonPath('meta.counts.pending', 1);

        $this->postJson('/api/v1/barcode-prints/mark', [
            'lines' => [['detail_id' => $lineId, 'labels' => 1]],
        ])->assertOk();
        $this->assertSame(2, TPurchasesDetail::find($lineId)->barcode_print_count);

        $this->postJson('/api/v1/barcode-prints/unmark', ['detail_ids' => [$lineId]])
            ->assertOk();

        $this->getJson('/api/v1/barcode-prints?status=pending')
            ->assertOk()
            ->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.counts.printed', 0);
    }

    public function test_lines_from_other_branches_are_not_listed_or_changed(): void
    {
        $this->user->update(['BC' => 'BR2']);
        $this->postGrn('BR2');
        $otherLineId = TPurchasesDetail::query()->where('BC', 'BR2')->value('id');

        $this->user->update(['BC' => 'HQ']);

        $this->getJson('/api/v1/barcode-prints?status=all')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->postJson('/api/v1/barcode-prints/mark', [
            'lines' => [['detail_id' => $otherLineId, 'labels' => 1]],
        ])->assertOk()->assertJsonPath('data.updated', 0);

        $this->assertNull(TPurchasesDetail::find($otherLineId)->barcode_printed_at);
    }
}
