<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Item;
use App\Models\ItemBatch;
use App\Models\Role;
use App\Models\SalesReturnReason;
use App\Models\Store;
use App\Models\TAccountTran;
use App\Models\User;
use App\Services\AccountingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SalesWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Customer $customer;
    private Store $store;
    private Item $item;

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

        $this->customer = Customer::create([
            'Code' => 'CUST0001',
            'name' => 'Test Customer',
            'NIC' => '901234567V',
            'phone' => '0771234567',
            'address' => 'Colombo',
            'advance_balance' => 0,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        $this->store = Store::create([
            'name' => 'Main Store',
            'location' => 'HQ',
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        $this->item = Item::create([
            'item_code' => 'ITM-BATCH',
            'item_description' => 'Batch Television',
            'is_batch' => true,
            'is_serialized' => false,
            'reorder_level' => 1,
            'standard_purchase_price' => 0,
            'standard_sales_price' => 0,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        ItemBatch::create([
            'batch_no' => 'SALE-BATCH',
            'item_code' => $this->item->item_code,
            'store_id' => $this->store->id,
            'purchase_price' => 350,
            'sales_price' => 500,
            'qty_in_hand' => 5,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        ItemBatch::create([
            'batch_no' => 'SALE-BATCH-2',
            'item_code' => $this->item->item_code,
            'store_id' => $this->store->id,
            'purchase_price' => 450,
            'sales_price' => 700,
            'qty_in_hand' => 5,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        Sanctum::actingAs($this->user);
    }

    public function test_advance_is_partially_carried_into_credit_sale_and_stock_is_dispatched(): void
    {
        $advance = $this->postJson('/api/v1/customer-advances', [
            'payment_date' => '2026-06-14',
            'customer_code' => $this->customer->Code,
            'amount' => 500,
            'cash_payment' => 500,
        ])->assertCreated()
            ->assertJsonPath('data.remaining_amount', '500.00');

        $advanceNo = $advance->json('data.payment_no');

        $invoice = $this->postJson('/api/v1/sales-invoices', [
            'invoice_date' => '2026-06-14',
            'reference_no' => 'SALE-REF-1',
            'customer_code' => $this->customer->Code,
            'store_id' => $this->store->id,
            'advance_amount' => 300,
            'cash_payment' => 200,
            'items' => [
                [
                    'item_code' => $this->item->item_code,
                    'batch_no' => 'SALE-BATCH',
                    'qty' => 2,
                    'unit_price' => 1,
                ],
            ],
        ])->assertCreated()
            ->assertJsonPath('data.Invoice_date', '2026-06-14')
            ->assertJsonPath('data.Net_Amount', '1000.00')
            ->assertJsonPath('data.advance_applied', '300.00')
            ->assertJsonPath('data.paid_amount', '500.00')
            ->assertJsonPath('data.Credite', '500.00')
            ->assertJsonPath('data.payment_status', 'partial')
            ->assertJsonPath('data.details.0.Unit_price', '500.00');

        $invoiceNo = $invoice->json('data.Invoice_no');

        $this->assertDatabaseHas('customers', [
            'Code' => $this->customer->Code,
            'advance_balance' => 200,
        ]);
        $this->assertDatabaseHas('t_advanc_cus_payments', [
            'payment_no' => $advanceNo,
            'remaining_amount' => 200,
            'is_carried_forward' => false,
        ]);
        $this->assertDatabaseHas('t_customer_advance_allocations', [
            'advance_payment_no' => $advanceNo,
            'sales_invoice_no' => $invoiceNo,
            'amount_allocated' => 300,
        ]);
        $this->assertDatabaseHas('item_batches', [
            'batch_no' => 'SALE-BATCH',
            'store_id' => $this->store->id,
            'qty_in_hand' => 3,
        ]);
        $this->assertDatabaseHas('t_account_trans', [
            'trance_type' => 'SALES_INVOICE',
            'trance_no' => $invoiceNo,
            'AccCode' => AccountingService::ACCOUNTS_RECEIVABLE,
            'dr_amount' => 1000,
            'cr_amount' => 0,
        ]);
        $this->assertDatabaseHas('t_account_trans', [
            'trance_type' => 'SALES_INVOICE',
            'trance_no' => $invoiceNo,
            'AccCode' => AccountingService::SALES_INCOME,
            'dr_amount' => 0,
            'cr_amount' => 1000,
        ]);
        $this->assertDatabaseHas('t_account_trans', [
            'trance_type' => 'CUSTOMER_ADVANCE_APPLIED',
            'trance_no' => $invoiceNo.'-ADV',
            'AccCode' => AccountingService::CUSTOMER_ADVANCES,
            'dr_amount' => 300,
            'cr_amount' => 0,
        ]);
        $this->assertDatabaseHas('t_account_trans', [
            'trance_type' => 'SALES_INVOICE_RECEIPT',
            'trance_no' => $invoiceNo.'-CASH_PAYMENT',
            'AccCode' => AccountingService::CASH,
            'dr_amount' => 200,
            'cr_amount' => 0,
        ]);
        $this->assertSame(
            '0.00',
            number_format(
                TAccountTran::query()->where('BC', 'HQ')->sum('dr_amount')
                - TAccountTran::query()->where('BC', 'HQ')->sum('cr_amount'),
                2,
                '.',
                ''
            )
        );

        $this->getJson('/api/v1/customer-payments/outstanding?customer_code='.$this->customer->Code)
            ->assertOk()
            ->assertJsonPath('data.advance_balance', 200)
            ->assertJsonPath('data.total_outstanding', 500)
            ->assertJsonPath('data.invoices.0.invoice_no', $invoiceNo);
    }

    public function test_customer_payment_settles_specific_sales_invoice(): void
    {
        $invoice = $this->postJson('/api/v1/sales-invoices', [
            'invoice_date' => '2026-06-14',
            'customer_code' => $this->customer->Code,
            'store_id' => $this->store->id,
            'items' => [
                [
                    'item_code' => $this->item->item_code,
                    'batch_no' => 'SALE-BATCH',
                    'qty' => 1,
                ],
            ],
        ])->assertCreated();

        $invoiceNo = $invoice->json('data.Invoice_no');

        $payment = $this->postJson('/api/v1/customer-payments', [
            'payment_date' => '2026-06-15',
            'customer_code' => $this->customer->Code,
            'payment_amount' => 500,
            'cash_payment' => 500,
            'allocations' => [
                [
                    'sales_invoice_no' => $invoiceNo,
                    'amount' => 500,
                ],
            ],
        ])->assertCreated()
            ->assertJsonPath('data.allocations.0.sales_invoice_no', $invoiceNo);
        $paymentNo = $payment->json('data.Payment_no');

        $this->assertDatabaseHas('t_invoice_sums', [
            'Invoice_no' => $invoiceNo,
            'paid_amount' => 500,
            'Credite' => 0,
            'payment_status' => 'paid',
        ]);
        $this->assertDatabaseHas('t_account_trans', [
            'trance_type' => 'CUSTOMER_PAYMENT_RECEIPT',
            'trance_no' => $paymentNo.'-CASH_PAYMENT',
            'AccCode' => AccountingService::CASH,
            'dr_amount' => 500,
            'cr_amount' => 0,
        ]);
        $this->assertDatabaseHas('t_account_trans', [
            'trance_type' => 'CUSTOMER_PAYMENT_RECEIPT',
            'trance_no' => $paymentNo.'-CASH_PAYMENT',
            'AccCode' => AccountingService::ACCOUNTS_RECEIVABLE,
            'dr_amount' => 0,
            'cr_amount' => 500,
        ]);

        $this->getJson('/api/v1/customer-payments/outstanding?customer_code='.$this->customer->Code)
            ->assertOk()
            ->assertJsonPath('data.total_outstanding', 0)
            ->assertJsonCount(0, 'data.invoices');
    }

    public function test_batch_invoice_uses_item_default_average_price_mode(): void
    {
        $this->item->forceFill([
            'default_batch_price_mode' => 'average',
        ])->save();

        $invoice = $this->postJson('/api/v1/sales-invoices', [
            'invoice_date' => '2026-07-01',
            'customer_code' => $this->customer->Code,
            'store_id' => $this->store->id,
            'items' => [
                [
                    'item_code' => $this->item->item_code,
                    'batch_no' => 'SALE-BATCH',
                    'qty' => 1,
                ],
            ],
        ])->assertCreated();

        $this->assertSame('600.00', $invoice->json('data.details.0.Unit_price'));
        $this->assertSame('600.00', $invoice->json('data.Net_Amount'));
    }

    public function test_sales_invoice_enforces_item_sales_price_criteria(): void
    {
        $this->item->forceFill([
            'sales_criteria_enabled' => true,
            'min_sales_price' => 550,
            'max_sales_price' => 650,
        ])->save();

        $this->postJson('/api/v1/sales-invoices', [
            'invoice_date' => '2026-07-01',
            'customer_code' => $this->customer->Code,
            'store_id' => $this->store->id,
            'items' => [
                [
                    'item_code' => $this->item->item_code,
                    'batch_no' => 'SALE-BATCH',
                    'qty' => 1,
                ],
            ],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('items.0.unit_price');
    }

    public function test_sales_workflow_rejects_other_branch_customer_and_store(): void
    {
        $otherCustomer = Customer::create([
            'Code' => 'CUST-BR02',
            'name' => 'Other Branch Customer',
            'NIC' => '881234567V',
            'advance_balance' => 0,
            'BC' => 'BR02',
            'UID' => 'branch-admin',
        ]);

        $this->postJson('/api/v1/customer-advances', [
            'payment_date' => '2026-06-14',
            'customer_code' => $otherCustomer->Code,
            'amount' => 100,
            'cash_payment' => 100,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('customer_code');
    }

    public function test_paid_sales_return_restores_stock_and_records_refund(): void
    {
        $reason = SalesReturnReason::create([
            'reason' => 'Customer changed mind',
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        $invoice = $this->postJson('/api/v1/sales-invoices', [
            'invoice_date' => '2026-06-14',
            'customer_code' => $this->customer->Code,
            'store_id' => $this->store->id,
            'cash_payment' => 500,
            'items' => [
                [
                    'item_code' => $this->item->item_code,
                    'batch_no' => 'SALE-BATCH',
                    'qty' => 1,
                ],
            ],
        ])->assertCreated();

        $invoiceNo = $invoice->json('data.Invoice_no');
        $detailId = $invoice->json('data.details.0.id');

        $this->postJson('/api/v1/sales-returns', [
            'return_date' => '2026-06-15',
            'invoice_no' => $invoiceNo,
            'reason_id' => $reason->id,
            'refund_method' => 'cash',
            'items' => [
                [
                    'invoice_detail_id' => $detailId,
                    'qty' => 1,
                ],
            ],
        ])->assertCreated()
            ->assertJsonPath('data.credit_adjustment', '0.00')
            ->assertJsonPath('data.refund_amount', '500.00');

        $this->assertDatabaseHas('item_batches', [
            'batch_no' => 'SALE-BATCH',
            'store_id' => $this->store->id,
            'qty_in_hand' => 5,
        ]);
        $this->assertDatabaseHas('t_invoice_sums', [
            'Invoice_no' => $invoiceNo,
            'returned_amount' => 500,
            'Credite' => 0,
            'status' => 'returned',
        ]);
    }
}
