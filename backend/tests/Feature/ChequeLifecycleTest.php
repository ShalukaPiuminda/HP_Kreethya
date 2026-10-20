<?php

namespace Tests\Feature;

use App\Models\BankDetail;
use App\Models\BankBranch;
use App\Models\Customer;
use App\Models\Item;
use App\Models\ItemBatch;
use App\Models\Role;
use App\Models\Store;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ChequeLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Customer $customer;
    private Supplier $supplier;
    private Store $store;
    private Item $item;
    private BankDetail $bankAccount;
    private BankBranch $bankBranch;

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
            'Code' => 'CUS-CHQ-1',
            'name' => 'Cheque Customer',
            'NIC' => '901111111V',
            'phone' => '0771111111',
            'advance_balance' => 0,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        $this->supplier = Supplier::create([
            'Code' => 'SUP-CHQ-1',
            'name' => 'Cheque Supplier',
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

        $this->item = Item::create([
            'item_code' => 'CHQ-ITEM',
            'item_description' => 'Cheque Test Item',
            'is_batch' => true,
            'is_serialized' => false,
            'reorder_level' => 0,
            'standard_purchase_price' => 0,
            'standard_sales_price' => 0,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        ItemBatch::create([
            'batch_no' => 'CHQ-BATCH',
            'item_code' => $this->item->item_code,
            'store_id' => $this->store->id,
            'purchase_price' => 300,
            'sales_price' => 500,
            'qty_in_hand' => 10,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        $this->bankAccount = BankDetail::create([
            'bank_name' => 'Main Operating Bank',
            'account_no' => '001-100',
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);
        $this->bankBranch = BankBranch::create([
            'bank_id' => $this->bankAccount->id,
            'branch_name' => 'Head Office',
            'branch_code' => '001',
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        Sanctum::actingAs($this->user);
    }

    public function test_customer_cheque_can_be_passed_into_selected_bank(): void
    {
        $advance = $this->postJson('/api/v1/customer-advances', [
            'payment_date' => '2026-06-14',
            'customer_code' => $this->customer->Code,
            'amount' => 500,
            'cheque_payment' => 500,
            'cheque' => [
                'bank_id' => $this->bankAccount->id,
                'bank_branch_id' => $this->bankBranch->id,
                'cheque_no' => 'CUS-PASS-001',
                'account_no' => '900-100',
                'due_date' => '2026-06-16',
            ],
        ])->assertCreated();

        $advanceNo = $advance->json('data.payment_no');
        $chequeId = $this->getJson('/api/v1/cheques/customer?status=pending')
            ->assertOk()
            ->assertJsonPath('data.0.trans_no', $advanceNo)
            ->assertJsonPath('data.0.status', 'pending')
            ->json('data.0.id');

        $this->postJson("/api/v1/cheques/customer/{$chequeId}/pass", [
            'action_date' => '2026-06-16',
            'bank_detail_id' => $this->bankAccount->id,
        ])->assertOk()
            ->assertJsonPath('data.status', 'passed')
            ->assertJsonPath('data.bank_account.id', $this->bankAccount->id);

        $this->assertDatabaseHas('t_bank_entries', [
            'invoice_no' => "CUS-CHQ-{$chequeId}-PASS",
            'bank_detail_id' => $this->bankAccount->id,
            'amount' => 500,
        ]);
        $this->assertDatabaseHas('t_account_trans', [
            'trance_type' => 'CUSTOMER_CHEQUE_PASS',
            'AccCode' => '1002',
            'dr_amount' => 500,
        ]);

        $this->getJson('/api/v1/cheques/summary')
            ->assertOk()
            ->assertJsonPath('data.customer.passed_count', 1)
            ->assertJsonPath('data.customer.passed_amount', 500)
            ->assertJsonPath('data.net_bank_impact', 500);

        $this->postJson("/api/v1/cheques/customer/{$chequeId}/return", [
            'action_date' => '2026-06-17',
            'reason' => 'Should not be allowed',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('status');
    }

    public function test_returned_customer_payment_cheque_restores_invoice_debt(): void
    {
        $invoice = $this->postJson('/api/v1/sales-invoices', [
            'invoice_date' => '2026-06-14',
            'customer_code' => $this->customer->Code,
            'store_id' => $this->store->id,
            'items' => [
                [
                    'item_code' => $this->item->item_code,
                    'batch_no' => 'CHQ-BATCH',
                    'qty' => 1,
                ],
            ],
        ])->assertCreated();

        $invoiceNo = $invoice->json('data.Invoice_no');

        $payment = $this->postJson('/api/v1/customer-payments', [
            'payment_date' => '2026-06-15',
            'customer_code' => $this->customer->Code,
            'payment_amount' => 500,
            'cheque_payment' => 500,
            'allocations' => [
                [
                    'sales_invoice_no' => $invoiceNo,
                    'amount' => 500,
                ],
            ],
            'cheque' => [
                'bank_id' => $this->bankAccount->id,
                'bank_branch_id' => $this->bankBranch->id,
                'cheque_no' => 'CUS-RETURN-001',
                'account_no' => '900-200',
                'due_date' => '2026-06-18',
            ],
        ])->assertCreated();

        $paymentNo = $payment->json('data.Payment_no');
        $chequeId = $this->getJson('/api/v1/cheques/customer?status=pending')
            ->assertOk()
            ->json('data.0.id');

        $this->postJson("/api/v1/cheques/customer/{$chequeId}/return", [
            'action_date' => '2026-06-19',
            'reason' => 'Insufficient funds',
        ])->assertOk()
            ->assertJsonPath('data.status', 'returned')
            ->assertJsonPath('data.return_reason', 'Insufficient funds');

        $this->assertDatabaseHas('t_invoice_sums', [
            'Invoice_no' => $invoiceNo,
            'paid_amount' => 0,
            'Credite' => 500,
            'payment_status' => 'unpaid',
        ]);
        $this->assertDatabaseHas('t_customer_account_trances', [
            'trance_no' => $paymentNo,
            'trance_type' => 'CUSTOMER_CHEQUE_RETURN',
            'dr_amount' => 500,
        ]);
        $this->getJson('/api/v1/customer-payments/outstanding?customer_code='.$this->customer->Code)
            ->assertOk()
            ->assertJsonPath('data.total_outstanding', 500);
    }

    public function test_returned_supplier_payment_cheque_restores_supplier_payable(): void
    {
        $purchase = $this->postJson('/api/v1/purchase-receipts', [
            'invoice_date' => '2026-06-14',
            'supplier_code' => $this->supplier->Code,
            'store_id' => $this->store->id,
            'items' => [
                [
                    'item_code' => $this->item->item_code,
                    'qty' => 1,
                    'unit_price' => 300,
                    'sales_price' => 500,
                    'batch_no' => 'SUP-CHQ-BATCH',
                ],
            ],
        ])->assertCreated();

        $purchaseNo = $purchase->json('data.Invoice_no');

        $payment = $this->postJson('/api/v1/supplier-payments', [
            'payment_date' => '2026-06-15',
            'supplier_code' => $this->supplier->Code,
            'payment_amount' => 300,
            'cheque_payment' => 300,
            'allocations' => [
                [
                    'purchase_invoice_no' => $purchaseNo,
                    'amount' => 300,
                ],
            ],
            'cheque' => [
                'bank_id' => $this->bankAccount->id,
                'bank_branch_id' => $this->bankBranch->id,
                'cheque_no' => 'SUP-RETURN-001',
                'account_no' => '001-100',
                'release_date' => '2026-06-18',
            ],
        ])->assertCreated();

        $paymentNo = $payment->json('data.Payment_no');
        $chequeId = $this->getJson('/api/v1/cheques/supplier?status=pending')
            ->assertOk()
            ->json('data.0.id');

        $this->postJson("/api/v1/cheques/supplier/{$chequeId}/return", [
            'action_date' => '2026-06-19',
            'reason' => 'Cheque cancelled',
        ])->assertOk()
            ->assertJsonPath('data.status', 'returned');

        $this->assertDatabaseHas('t_purchases_sums', [
            'Invoice_no' => $purchaseNo,
            'paid_amount' => 0,
            'credit_payment' => 300,
            'payment_status' => 'unpaid',
        ]);
        $this->assertDatabaseHas('t_sup_purchase_trances', [
            'trance_no' => $paymentNo,
            'trance_type' => 'SUPPLIER_CHEQUE_RETURN',
            'cr_amount' => 300,
        ]);
        $this->getJson('/api/v1/supplier-payments/outstanding?supplier_code='.$this->supplier->Code)
            ->assertOk()
            ->assertJsonPath('data.total_outstanding', 300);
    }
}
