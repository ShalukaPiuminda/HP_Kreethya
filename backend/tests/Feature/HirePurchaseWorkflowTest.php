<?php

namespace Tests\Feature;

use App\Models\BankBranch;
use App\Models\BankDetail;
use App\Models\Customer;
use App\Models\Item;
use App\Models\MGuarantor;
use App\Models\MSchema;
use App\Models\Role;
use App\Models\Store;
use App\Models\User;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class HirePurchaseWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Customer $customer;
    private Store $store;
    private Item $item;
    private MGuarantor $guarantor;
    private BankDetail $bank;
    private BankBranch $bankBranch;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::create(['name' => Role::SUPER_ADMIN, 'description' => 'Administrator']);
        $this->user = User::create([
            'username' => 'admin',
            'email' => 'admin@example.com',
            'password' => 'password',
            'role_id' => $role->id,
            'BC' => 'HQ',
        ]);
        $this->customer = Customer::create([
            'Code' => 'CUS-HP-1',
            'name' => 'HP Customer',
            'NIC' => '901111111V',
            'phone' => '0771111111',
            'address' => 'Colombo',
            'advance_balance' => 0,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);
        $this->guarantor = MGuarantor::create([
            'Code' => 'GUA-HP-1',
            'name' => 'Primary Guarantor',
            'NIC' => '882222222V',
            'phone' => '0772222222',
            'address' => 'Colombo',
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);
        MSchema::create([
            'SchemaType' => 'HP-4',
            'DownpaymentPrecentage' => 20,
            'InstallmentRate' => 10,
            'NoOfInstallment' => 4,
            'DocumentCharagePrecentage' => 2,
            'PanaltyCharage' => 2.5,
            'GracePeriodDays' => 5,
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
            'item_code' => 'HP-TV-1',
            'item_description' => 'Hire Purchase Television',
            'is_batch' => false,
            'is_serialized' => false,
            'reorder_level' => 0,
            'standard_purchase_price' => 70000,
            'standard_sales_price' => 100000,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);
        $this->bank = BankDetail::create([
            'bank_name' => 'Customer Bank',
            'account_no' => 'SOURCE-001',
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);
        $this->bankBranch = BankBranch::create([
            'bank_id' => $this->bank->id,
            'branch_name' => 'Colombo',
            'branch_code' => 'COL-01',
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);
        app(StockService::class)->receiveStock(
            'OPEN-HP',
            'OPENING',
            $this->item->item_code,
            null,
            $this->store->id,
            2,
            70000,
            100000,
            'HQ',
            'admin'
        );
        Sanctum::actingAs($this->user);
    }

    public function test_agreement_uses_net_less_downpayment_and_supports_installment_and_conversion(): void
    {
        $agreement = $this->postJson('/api/v1/hp', [
            'invoice_date' => '2026-01-01',
            'customer_code' => $this->customer->Code,
            'guarantor_1_code' => $this->guarantor->Code,
            'schema_type' => 'HP-4',
            'store_id' => $this->store->id,
            'down_payment' => 20000,
            'down_payment_method' => 'cash',
            'transport' => 1000,
            'instalment_due_date' => 1,
            'items' => [
                [
                    'item_code' => $this->item->item_code,
                    'qty' => 1,
                ],
            ],
        ])->assertCreated()
            ->assertJsonPath('data.net_amount', '100000.00')
            ->assertJsonPath('data.instalment_amount', '8000.00')
            ->assertJsonPath('data.document_charge', '1600.00')
            ->assertJsonPath('data.due_amount', '90600.00')
            ->assertJsonPath('data.contract_amount', '110600.00')
            ->assertJsonPath('data.outstanding_amount', '90600.00')
            ->assertJsonCount(4, 'data.instalments');

        $agreementId = $agreement->json('data.id');
        $firstInstallmentId = $agreement->json('data.instalments.0.id');

        $penalty = $this->getJson("/api/v1/installments/{$firstInstallmentId}?as_of=2026-03-05")
            ->assertOk()
            ->json('data.penalty.penalty_amount');
        $this->assertGreaterThan(0, $penalty);

        $firstBalance = (float) $agreement->json('data.instalments.0.balance_amount');
        $this->postJson("/api/v1/installments/{$firstInstallmentId}/pay", [
            'payment_date' => '2026-03-05',
            'amount' => $firstBalance + (float) $penalty,
            'payment_method' => 'cash',
        ])->assertOk()
            ->assertJsonPath('data.instalments.0.status', 'paid');

        $fresh = $this->getJson("/api/v1/hp/{$agreementId}")->assertOk();
        $outstanding = (float) $fresh->json('data.outstanding_amount');

        $this->postJson("/api/v1/hp/{$agreementId}/convert", [
            'conversion_date' => '2026-03-06',
            'amount' => $outstanding - 100,
            'discount' => 100,
            'payment_method' => 'cash',
        ])->assertOk()
            ->assertJsonPath('data.status', 'converted')
            ->assertJsonPath('data.outstanding_amount', '0.00');

        $this->assertDatabaseHas('t_item_movements', [
            'trans_code' => 'HP-SALE',
            'item_code' => $this->item->item_code,
            'qun_out' => 1,
        ]);
        $this->assertSame(
            (float) \DB::table('t_account_trans')->sum('dr_amount'),
            (float) \DB::table('t_account_trans')->sum('cr_amount')
        );
    }

    public function test_opening_hire_purchase_imports_existing_installments_without_stock_dispatch(): void
    {
        $response = $this->postJson('/api/v1/hp/opening', [
            'invoice_date' => '2026-07-21',
            'opening_reference_no' => 'OLD-HP-009',
            'customer_code' => $this->customer->Code,
            'guarantor_1_code' => $this->guarantor->Code,
            'schema_type' => 'HP-4',
            'store_id' => $this->store->id,
            'opening_note' => 'Migrated from previous ledger.',
            'items' => [
                [
                    'item_code' => $this->item->item_code,
                    'qty' => 1,
                    'unit_price' => 100000,
                    'net_value' => 100000,
                ],
            ],
            'installments' => [
                [
                    'instalment_no' => 1,
                    'instalment_date' => '2026-06-21',
                    'base_amount' => 25000,
                    'amount_pay' => 25000,
                    'balance_amount' => 0,
                ],
                [
                    'instalment_no' => 2,
                    'instalment_date' => '2026-07-21',
                    'base_amount' => 25000,
                    'amount_pay' => 10000,
                    'balance_amount' => 15000,
                ],
                [
                    'instalment_no' => 3,
                    'instalment_date' => '2026-08-21',
                    'base_amount' => 25000,
                    'amount_pay' => 0,
                    'balance_amount' => 25000,
                ],
            ],
        ])->assertCreated()
            ->assertJsonPath('data.is_opening', true)
            ->assertJsonPath('data.opening_reference_no', 'OLD-HP-009')
            ->assertJsonPath('data.contract_amount', '75000.00')
            ->assertJsonPath('data.paid_amount', '35000.00')
            ->assertJsonPath('data.outstanding_amount', '40000.00')
            ->assertJsonCount(3, 'data.instalments');

        $invoiceNo = $response->json('data.invoice_no');

        $this->assertDatabaseMissing('t_item_movements', [
            'trans_no' => $invoiceNo,
            'trans_code' => 'HP-SALE',
        ]);
        $this->assertDatabaseHas('t_customer_account_trances', [
            'no' => $invoiceNo,
            'trance_type' => 'HP_OPENING',
            'dr_amount' => 40000,
        ]);
        $this->assertSame(
            (float) \DB::table('t_account_trans')->sum('dr_amount'),
            (float) \DB::table('t_account_trans')->sum('cr_amount')
        );
    }

    public function test_active_agreement_can_be_returned_and_stock_is_restored(): void
    {
        $agreement = $this->postJson('/api/v1/hp', [
            'invoice_date' => '2026-06-14',
            'customer_code' => $this->customer->Code,
            'guarantor_1_code' => $this->guarantor->Code,
            'schema_type' => 'HP-4',
            'store_id' => $this->store->id,
            'down_payment' => 20000,
            'down_payment_method' => 'cash',
            'instalment_due_date' => 15,
            'items' => [['item_code' => $this->item->item_code, 'qty' => 1]],
        ])->assertCreated();

        $this->postJson('/api/v1/hp/'.$agreement->json('data.id').'/return', [
            'return_date' => '2026-06-20',
            'store_id' => $this->store->id,
            'reason' => 'Customer surrendered the item.',
            'refund_amount' => 5000,
            'refund_method' => 'cash',
        ])->assertOk()
            ->assertJsonPath('data.status', 'returned')
            ->assertJsonPath('data.outstanding_amount', '0.00')
            ->assertJsonCount(1, 'data.returns');

        $this->assertDatabaseHas('t_item_movements', [
            'trans_code' => 'HP-RETURN',
            'item_code' => $this->item->item_code,
            'qun_in' => 1,
        ]);
    }

    public function test_hire_purchase_enforces_item_sales_price_criteria(): void
    {
        $this->item->forceFill([
            'sales_criteria_enabled' => true,
            'min_sales_price' => 110000,
        ])->save();

        $this->postJson('/api/v1/hp', [
            'invoice_date' => '2026-06-14',
            'customer_code' => $this->customer->Code,
            'guarantor_1_code' => $this->guarantor->Code,
            'schema_type' => 'HP-4',
            'store_id' => $this->store->id,
            'down_payment' => 20000,
            'down_payment_method' => 'cash',
            'instalment_due_date' => 15,
            'items' => [['item_code' => $this->item->item_code, 'qty' => 1]],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('items.0.unit_price');
    }

    public function test_customer_advance_is_carried_into_hp_and_bounced_cheque_restores_hp_balance(): void
    {
        $advance = $this->postJson('/api/v1/customer-advances', [
            'payment_date' => '2026-06-14',
            'customer_code' => $this->customer->Code,
            'amount' => 5000,
            'cheque_payment' => 5000,
            'cheque' => [
                'bank_id' => $this->bank->id,
                'bank_branch_id' => $this->bankBranch->id,
                'cheque_no' => 'ADV-HP-001',
                'account_no' => '900-001',
                'due_date' => '2026-06-16',
            ],
        ])->assertCreated();

        $agreement = $this->postJson('/api/v1/hp', [
            'invoice_date' => '2026-06-14',
            'customer_code' => $this->customer->Code,
            'guarantor_1_code' => $this->guarantor->Code,
            'schema_type' => 'HP-4',
            'store_id' => $this->store->id,
            'down_payment' => 20000,
            'advance_amount' => 5000,
            'down_payment_method' => 'cash',
            'instalment_due_date' => 15,
            'items' => [['item_code' => $this->item->item_code, 'qty' => 1]],
        ])->assertCreated()
            ->assertJsonPath('data.advance_applied', '5000.00')
            ->assertJsonPath('data.paid_amount', '20000.00');

        $invoiceNo = $agreement->json('data.invoice_no');
        $this->assertDatabaseHas('t_customer_hp_advance_allocations', [
            'advance_payment_no' => $advance->json('data.payment_no'),
            'hp_invoice_no' => $invoiceNo,
            'amount_allocated' => 5000,
        ]);
        $this->assertDatabaseHas('customers', [
            'Code' => $this->customer->Code,
            'advance_balance' => 0,
        ]);

        $chequeId = $this->getJson('/api/v1/cheques/customer?status=pending')
            ->assertOk()
            ->json('data.0.id');
        $this->postJson("/api/v1/cheques/customer/{$chequeId}/return", [
            'action_date' => '2026-06-17',
            'reason' => 'Account closed',
        ])->assertOk();

        $this->assertDatabaseHas('t_hire_purchase_sums', [
            'invoice_no' => $invoiceNo,
            'advance_applied' => 0,
            'paid_amount' => 15000,
            'down_payment_outstanding' => 5000,
        ]);
        $this->assertDatabaseMissing('t_customer_hp_advance_allocations', [
            'hp_invoice_no' => $invoiceNo,
        ]);
        $this->assertDatabaseHas('t_account_trans', [
            'trance_type' => 'CUSTOMER_CHEQUE_RETURN',
            'AccCode' => '1301',
            'dr_amount' => 5000,
        ]);

        $this->getJson('/api/v1/customer-payments/outstanding?customer_code='.$this->customer->Code)
            ->assertOk()
            ->assertJsonPath('data.advance_balance', 0)
            ->assertJsonPath('data.hp_outstanding', 94600)
            ->assertJsonPath('data.total_account_outstanding', 94600);
    }

    public function test_returned_hp_installment_cheque_restores_schedule_and_accounting(): void
    {
        $agreement = $this->postJson('/api/v1/hp', [
            'invoice_date' => '2026-06-14',
            'customer_code' => $this->customer->Code,
            'guarantor_1_code' => $this->guarantor->Code,
            'schema_type' => 'HP-4',
            'store_id' => $this->store->id,
            'down_payment' => 20000,
            'down_payment_method' => 'cash',
            'instalment_due_date' => 15,
            'items' => [['item_code' => $this->item->item_code, 'qty' => 1]],
        ])->assertCreated();

        $firstInstallmentId = $agreement->json('data.instalments.0.id');
        $firstBalance = (float) $agreement->json('data.instalments.0.balance_amount');

        $this->postJson("/api/v1/installments/{$firstInstallmentId}/pay", [
            'payment_date' => '2026-07-15',
            'amount' => $firstBalance,
            'payment_method' => 'cheque',
            'cheque' => [
                'bank_id' => $this->bank->id,
                'bank_branch_id' => $this->bankBranch->id,
                'cheque_no' => 'HP-INST-001',
                'account_no' => '900-002',
                'due_date' => '2026-07-20',
            ],
        ])->assertOk()
            ->assertJsonPath('data.instalments.0.status', 'paid');

        $chequeId = $this->getJson('/api/v1/cheques/customer?status=pending')
            ->assertOk()
            ->assertJsonPath('data.0.trans_type', 'HP_INSTALLMENT')
            ->json('data.0.id');

        $this->postJson("/api/v1/cheques/customer/{$chequeId}/return", [
            'action_date' => '2026-07-21',
            'reason' => 'Insufficient funds',
        ])->assertOk()
            ->assertJsonPath('data.status', 'returned')
            ->assertJsonPath('data.return_reason', 'Insufficient funds');

        $this->assertDatabaseHas('t_instalments', [
            'id' => $firstInstallmentId,
            'amount_pay' => 0,
            'balance_amount' => $firstBalance,
            'status' => 'pending',
        ]);
        $this->assertDatabaseHas('t_hp_installment_payments', [
            'instalment_id' => $firstInstallmentId,
            'status' => 'returned',
            'return_reason' => 'Insufficient funds',
        ]);
        $this->assertDatabaseHas('t_hire_purchase_sums', [
            'invoice_no' => $agreement->json('data.invoice_no'),
            'paid_amount' => 20000,
            'outstanding_amount' => 89600,
            'status' => 'active',
        ]);
        $this->assertDatabaseHas('t_account_trans', [
            'trance_type' => 'CUSTOMER_CHEQUE_RETURN',
            'AccCode' => '1301',
            'dr_amount' => $firstBalance,
        ]);
    }
}
