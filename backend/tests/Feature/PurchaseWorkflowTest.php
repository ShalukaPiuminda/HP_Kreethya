<?php

namespace Tests\Feature;

use App\Models\Item;
use App\Models\Role;
use App\Models\Store;
use App\Models\Supplier;
use App\Models\TItemSerialMovement;
use App\Models\TPurchaseOrderSum;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PurchaseWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Supplier $supplier;
    private Store $store;
    private Item $batchItem;
    private Item $standardItem;

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

        $this->supplier = Supplier::create([
            'Code' => 'SUP0001',
            'name' => 'Main Supplier',
            'phone' => '0112000000',
            'address' => 'Colombo',
            'type' => 'normal',
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        $this->store = Store::create([
            'name' => 'Main Store',
            'location' => 'HQ',
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        $this->batchItem = Item::create([
            'item_code' => 'ITM-BATCH',
            'item_description' => 'Batch Item',
            'is_batch' => true,
            'is_serialized' => false,
            'reorder_level' => 2,
            'standard_purchase_price' => 0,
            'standard_sales_price' => 0,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        $this->standardItem = Item::create([
            'item_code' => 'ITM-STANDARD',
            'item_description' => 'Standard Item',
            'is_batch' => false,
            'is_serialized' => false,
            'reorder_level' => 2,
            'standard_purchase_price' => 500,
            'standard_sales_price' => 650,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        Sanctum::actingAs($this->user);
    }

    public function test_purchase_order_can_be_approved_and_received_in_stages(): void
    {
        $createResponse = $this->postJson('/api/v1/purchase-orders', [
            'po_date' => '2026-06-14',
            'expected_date' => '2026-06-20',
            'supplier_code' => $this->supplier->Code,
            'notes' => 'Deliver in two shipments.',
            'items' => [
                [
                    'item_code' => $this->batchItem->item_code,
                    'qty' => 5,
                    'unit_price' => 100,
                ],
            ],
        ])->assertCreated()
            ->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.details.0.received_qty', 0);

        $orderId = $createResponse->json('data.id');
        $orderNo = $createResponse->json('data.po_no');

        $this->postJson("/api/v1/purchase-orders/{$orderId}/approve")
            ->assertOk()
            ->assertJsonPath('data.status', 'approved');

        $this->postJson('/api/v1/purchase-receipts', [
            'invoice_date' => '2026-06-14',
            'reference_no' => 'SUP-INV-1',
            'supplier_code' => $this->supplier->Code,
            'purchase_order_no' => $orderNo,
            'store_id' => $this->store->id,
            'cash_payment' => 100,
            'items' => [
                [
                    'item_code' => $this->batchItem->item_code,
                    'qty' => 2,
                    'unit_price' => 100,
                    'sales_price' => 150,
                    'batch_no' => 'BATCH-001',
                ],
            ],
        ])->assertCreated()
            ->assertJsonPath('data.payment_status', 'partial')
            ->assertJsonPath('data.paid_amount', '100.00');

        $this->assertDatabaseHas('t_purchase_order_sums', [
            'id' => $orderId,
            'status' => 'partially_received',
        ]);
        $this->assertDatabaseHas('t_purchases_order_details', [
            'po_no' => $orderNo,
            'item_code' => $this->batchItem->item_code,
            'received_qty' => 2,
        ]);
        $this->assertDatabaseHas('item_batches', [
            'batch_no' => 'BATCH-001',
            'item_code' => $this->batchItem->item_code,
            'store_id' => $this->store->id,
            'purchase_price' => 100,
            'sales_price' => 150,
            'qty_in_hand' => 2,
        ]);

        $this->postJson('/api/v1/purchase-receipts', [
            'invoice_date' => '2026-06-15',
            'reference_no' => 'SUP-INV-2',
            'supplier_code' => $this->supplier->Code,
            'purchase_order_no' => $orderNo,
            'store_id' => $this->store->id,
            'items' => [
                [
                    'item_code' => $this->batchItem->item_code,
                    'qty' => 3,
                    'unit_price' => 100,
                    'sales_price' => 150,
                    'batch_no' => 'BATCH-001',
                ],
            ],
        ])->assertCreated();

        $this->assertDatabaseHas('t_purchase_order_sums', [
            'id' => $orderId,
            'status' => 'received',
        ]);
        $this->assertDatabaseHas('item_batches', [
            'batch_no' => 'BATCH-001',
            'item_code' => $this->batchItem->item_code,
            'store_id' => $this->store->id,
            'qty_in_hand' => 5,
        ]);

        $this->getJson('/api/v1/purchase-orders/open')
            ->assertOk()
            ->assertJsonMissing(['po_no' => $orderNo]);
    }

    public function test_grn_can_update_default_batch_price_mode_for_future_sales(): void
    {
        $this->postJson('/api/v1/purchase-receipts', [
            'invoice_date' => '2026-07-01',
            'reference_no' => 'SUP-INV-MODE',
            'supplier_code' => $this->supplier->Code,
            'store_id' => $this->store->id,
            'items' => [
                [
                    'item_code' => $this->batchItem->item_code,
                    'qty' => 1,
                    'unit_price' => 100,
                    'sales_price' => 150,
                    'price_mode' => 'average',
                    'batch_no' => 'BATCH-MODE-001',
                ],
            ],
        ])->assertCreated();

        $this->assertDatabaseHas('items', [
            'item_code' => $this->batchItem->item_code,
            'default_batch_price_mode' => 'average',
        ]);
    }

    public function test_grn_serials_can_be_edited_while_still_available(): void
    {
        $serializedItem = Item::create([
            'item_code' => 'ITM-SERIAL-GRN',
            'item_description' => 'Serialized GRN Item',
            'is_batch' => false,
            'is_serialized' => true,
            'reorder_level' => 0,
            'standard_purchase_price' => 250,
            'standard_sales_price' => 350,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        $receipt = $this->postJson('/api/v1/purchase-receipts', [
            'invoice_date' => '2026-07-02',
            'reference_no' => 'SER-GRN-001',
            'supplier_code' => $this->supplier->Code,
            'store_id' => $this->store->id,
            'items' => [
                [
                    'item_code' => $serializedItem->item_code,
                    'qty' => 2,
                    'unit_price' => 250,
                    'serial_numbers' => ['GRN-OLD-001', 'GRN-OLD-002'],
                ],
            ],
        ])->assertCreated();

        $receiptId = $receipt->json('data.id');
        $detailId = $receipt->json('data.details.0.id');
        $invoiceNo = $receipt->json('data.Invoice_no');

        $this->patchJson("/api/v1/purchase-receipts/{$receiptId}/serials", [
            'detail_id' => $detailId,
            'serial_numbers' => ['GRN-NEW-001', 'GRN-NEW-002'],
        ])->assertOk()
            ->assertJsonPath('data.details.0.serial_numbers.0', 'GRN-NEW-001');

        $this->assertDatabaseMissing('t_item_serial_movements', [
            'trans_no' => $invoiceNo,
            'item_serial_no' => 'GRN-OLD-001',
        ]);
        $this->assertDatabaseHas('t_purchases_details', [
            'id' => $detailId,
            'Invoice_no' => $invoiceNo,
        ]);
        $this->assertDatabaseHas('t_item_serial_movements', [
            'trans_no' => $invoiceNo,
            'trans_code' => 'GRN',
            'item_serial_no' => 'GRN-NEW-001',
            'qun_in' => 1,
            'qun_out' => 0,
        ]);
        $this->assertDatabaseHas('serial_edit_audits', [
            'source_type' => 'GRN',
            'source_no' => $invoiceNo,
            'item_code' => $serializedItem->item_code,
            'old_serial_no' => 'GRN-OLD-001',
            'new_serial_no' => 'GRN-NEW-001',
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);
    }

    public function test_grn_generates_serials_for_serialized_items_when_auto_serial_is_on(): void
    {
        $serializedItem = $this->createSerializedItem('ITM-AUTO');

        $first = $this->postJson('/api/v1/purchase-receipts', [
            'invoice_date' => '2026-10-23',
            'supplier_code' => $this->supplier->Code,
            'store_id' => $this->store->id,
            'items' => [
                [
                    'item_code' => $serializedItem->item_code,
                    'qty' => 3,
                    'free_qty' => 1,
                    'unit_price' => 250,
                    'auto_serial' => true,
                    'serial_numbers' => ['IGNORED-001'],
                ],
                [
                    'item_code' => $this->standardItem->item_code,
                    'qty' => 2,
                    'unit_price' => 500,
                    'auto_serial' => true,
                ],
            ],
        ])->assertCreated()
            ->assertJsonPath('data.details.0.serial_numbers', [
                'ITM-AUTO-000001',
                'ITM-AUTO-000002',
                'ITM-AUTO-000003',
                'ITM-AUTO-000004',
            ])
            ->assertJsonPath('data.details.1.serial_numbers', []);

        $invoiceNo = $first->json('data.Invoice_no');
        $this->assertSame(4, TItemSerialMovement::query()
            ->where('trans_no', $invoiceNo)
            ->where('item_code', $serializedItem->item_code)
            ->where('qun_in', 1)
            ->count());

        $this->postJson('/api/v1/purchase-receipts', [
            'invoice_date' => '2026-10-23',
            'supplier_code' => $this->supplier->Code,
            'store_id' => $this->store->id,
            'items' => [
                [
                    'item_code' => $serializedItem->item_code,
                    'qty' => 1,
                    'unit_price' => 250,
                    'auto_serial' => true,
                ],
            ],
        ])->assertCreated()
            ->assertJsonPath('data.details.0.serial_numbers', ['ITM-AUTO-000005']);
    }

    public function test_generated_serials_skip_numbers_already_entered_manually(): void
    {
        $serializedItem = $this->createSerializedItem('ITM-SKIP');

        $this->postJson('/api/v1/purchase-receipts', [
            'invoice_date' => '2026-10-23',
            'supplier_code' => $this->supplier->Code,
            'store_id' => $this->store->id,
            'items' => [
                [
                    'item_code' => $serializedItem->item_code,
                    'qty' => 1,
                    'unit_price' => 250,
                    'serial_numbers' => ['ITM-SKIP-000001'],
                ],
            ],
        ])->assertCreated();

        $this->postJson('/api/v1/purchase-receipts', [
            'invoice_date' => '2026-10-23',
            'supplier_code' => $this->supplier->Code,
            'store_id' => $this->store->id,
            'items' => [
                [
                    'item_code' => $serializedItem->item_code,
                    'qty' => 1,
                    'unit_price' => 250,
                    'auto_serial' => true,
                ],
            ],
        ])->assertCreated()
            ->assertJsonPath('data.details.0.serial_numbers', ['ITM-SKIP-000002']);
    }

    public function test_manual_serial_entry_still_requires_one_serial_per_unit(): void
    {
        $serializedItem = $this->createSerializedItem('ITM-MANUAL');

        $this->postJson('/api/v1/purchase-receipts', [
            'invoice_date' => '2026-10-23',
            'supplier_code' => $this->supplier->Code,
            'store_id' => $this->store->id,
            'items' => [
                [
                    'item_code' => $serializedItem->item_code,
                    'qty' => 2,
                    'unit_price' => 250,
                    'auto_serial' => false,
                    'serial_numbers' => ['MAN-001'],
                ],
            ],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('items.0.item_code');
    }

    private function createSerializedItem(string $itemCode): Item
    {
        return Item::create([
            'item_code' => $itemCode,
            'item_description' => 'Serialized Item',
            'is_batch' => false,
            'is_serialized' => true,
            'reorder_level' => 0,
            'standard_purchase_price' => 250,
            'standard_sales_price' => 350,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);
    }

    public function test_supplier_payment_allocates_against_outstanding_purchase(): void
    {
        $receipt = $this->postJson('/api/v1/purchase-receipts', [
            'invoice_date' => '2026-06-14',
            'reference_no' => 'CREDIT-001',
            'supplier_code' => $this->supplier->Code,
            'store_id' => $this->store->id,
            'items' => [
                [
                    'item_code' => $this->standardItem->item_code,
                    'qty' => 2,
                    'unit_price' => 500,
                ],
            ],
        ])->assertCreated()
            ->assertJsonPath('data.payment_status', 'unpaid');

        $invoiceNo = $receipt->json('data.Invoice_no');

        $this->getJson('/api/v1/supplier-payments/outstanding?supplier_code='.$this->supplier->Code)
            ->assertOk()
            ->assertJsonPath('data.total_outstanding', 1000)
            ->assertJsonPath('data.invoices.0.invoice_no', $invoiceNo);

        $this->postJson('/api/v1/supplier-payments', [
            'payment_date' => '2026-06-15',
            'supplier_code' => $this->supplier->Code,
            'payment_note' => 'Part settlement',
            'payment_amount' => 400,
            'cash_payment' => 400,
            'allocations' => [
                [
                    'purchase_invoice_no' => $invoiceNo,
                    'amount' => 400,
                ],
            ],
        ])->assertCreated()
            ->assertJsonPath('data.Payment_Amount', '400.00')
            ->assertJsonPath('data.allocations.0.purchase_invoice_no', $invoiceNo);

        $this->assertDatabaseHas('t_purchases_sums', [
            'Invoice_no' => $invoiceNo,
            'paid_amount' => 400,
            'payment_status' => 'partial',
        ]);

        $this->getJson('/api/v1/supplier-payments/outstanding?supplier_code='.$this->supplier->Code)
            ->assertOk()
            ->assertJsonPath('data.total_outstanding', 600);

        $this->postJson('/api/v1/supplier-payments', [
            'payment_date' => '2026-06-16',
            'supplier_code' => $this->supplier->Code,
            'payment_amount' => 700,
            'cash_payment' => 700,
            'allocations' => [
                [
                    'purchase_invoice_no' => $invoiceNo,
                    'amount' => 700,
                ],
            ],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('allocations.0.amount');
    }

    public function test_purchase_endpoints_enforce_branch_scope(): void
    {
        $otherSupplier = Supplier::create([
            'Code' => 'SUP-BR02',
            'name' => 'Other Branch Supplier',
            'type' => 'normal',
            'BC' => 'BR02',
            'UID' => 'branch-admin',
        ]);

        $otherOrder = TPurchaseOrderSum::create([
            'po_no' => 'PO-BR02-001',
            'po_date' => '2026-06-14',
            'supplier_code' => $otherSupplier->Code,
            'gross_amount' => 100,
            'net_amount' => 100,
            'status' => 'draft',
            'BC' => 'BR02',
            'UID' => 'branch-admin',
        ]);

        $this->getJson("/api/v1/purchase-orders/{$otherOrder->id}")
            ->assertNotFound();

        $this->postJson('/api/v1/purchase-orders', [
            'po_date' => '2026-06-14',
            'supplier_code' => $otherSupplier->Code,
            'items' => [
                [
                    'item_code' => $this->standardItem->item_code,
                    'qty' => 1,
                    'unit_price' => 500,
                ],
            ],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('supplier_code');
    }
}
