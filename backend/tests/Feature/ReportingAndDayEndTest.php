<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Item;
use App\Models\Role;
use App\Models\Store;
use App\Models\User;
use App\Services\AccountingService;
use App\Services\SalesService;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportingAndDayEndTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Store $store;
    private Customer $customer;
    private Item $batchItem;

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
        Sanctum::actingAs($this->user);
        $this->getJson('/api/v1/finance/options')->assertOk();

        $this->store = Store::create([
            'name' => 'Main Store',
            'location' => 'HQ',
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        $this->customer = Customer::create([
            'Code' => 'CUST001',
            'name' => 'Walk In Customer',
            'NIC' => '901234567V',
            'phone' => '0771234567',
            'address' => 'Colombo',
            'advance_balance' => 0,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        $this->batchItem = Item::create([
            'item_code' => 'REP-ITEM-01',
            'item_description' => 'Reporting Test Item',
            'is_batch' => true,
            'is_serialized' => true,
            'default_batch_price_mode' => 'batch',
            'reorder_level' => 1,
            'standard_purchase_price' => 0,
            'standard_sales_price' => 0,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);
    }

    public function test_day_end_closing_carries_cash_to_next_opening(): void
    {
        app(AccountingService::class)->postBalanced(
            'TEST_RECEIPT',
            'REC-001',
            '2026-06-14',
            AccountingService::CASH,
            AccountingService::SALES_INCOME,
            500,
            $this->user
        );

        $this->getJson('/api/v1/reports/day-end-preview?date=2026-06-14')
            ->assertOk()
            ->assertJsonPath('data.opening_balance', 0)
            ->assertJsonPath('data.cash_in', 500)
            ->assertJsonPath('data.expected_closing', 500)
            ->assertJsonPath('data.trial_balance_difference', 0);

        $this->postJson('/api/v1/reports/day-end-close', [
            'close_date' => '2026-06-14',
            'counted_cash' => 495,
            'notes' => 'Five rupee shortage.',
        ])->assertCreated()
            ->assertJsonPath('data.closing_balance', '500.00')
            ->assertJsonPath('data.variance', '-5.00');

        $this->getJson('/api/v1/reports/day-end-preview?date=2026-06-15')
            ->assertOk()
            ->assertJsonPath('data.opening_balance', 500)
            ->assertJsonPath('data.expected_closing', 500);

        $this->postJson('/api/v1/reports/day-end-close', [
            'close_date' => '2026-06-14',
            'counted_cash' => 500,
        ])->assertUnprocessable();
    }

    public function test_trial_balance_and_overview_are_balanced(): void
    {
        app(AccountingService::class)->postBalanced(
            'TEST_RECEIPT',
            'REC-002',
            '2026-06-14',
            AccountingService::CASH,
            AccountingService::SERVICE_INCOME,
            250,
            $this->user
        );

        $this->getJson('/api/v1/reports/trial-balance?to=2026-06-14')
            ->assertOk()
            ->assertJsonPath('data.debit_total', 250)
            ->assertJsonPath('data.credit_total', 250)
            ->assertJsonPath('data.difference', 0);

        $this->getJson('/api/v1/reports/overview?from=2026-06-01&to=2026-06-30')
            ->assertOk()
            ->assertJsonPath('data.trial_balance_difference', 0);
    }

    public function test_stock_in_hand_and_bin_card_reports_include_batch_and_serials(): void
    {
        app(StockService::class)->receiveStock(
            'GRN-REP-001',
            'GRN',
            $this->batchItem->item_code,
            'BATCH-001',
            $this->store->id,
            2,
            500,
            650,
            'HQ',
            'admin',
            ['SER-001', 'SER-002']
        );

        app(StockService::class)->dispatchStock(
            'INV-REP-001',
            'INV',
            $this->batchItem->item_code,
            'BATCH-001',
            $this->store->id,
            1,
            'HQ',
            'admin',
            ['SER-001']
        );

        $this->getJson('/api/v1/reports/stock-in-hand?item_code='.$this->batchItem->item_code)
            ->assertOk()
            ->assertJsonPath('data.summary.items', 1)
            ->assertJsonPath('data.rows.0.item_code', $this->batchItem->item_code)
            ->assertJsonPath('data.rows.0.total_qty', 1)
            ->assertJsonPath('data.rows.0.batches.0.batch_no', 'BATCH-001')
            ->assertJsonPath('data.rows.0.serial_numbers.0', 'SER-002');

        $this->getJson('/api/v1/reports/bin-card?item_code='.$this->batchItem->item_code.'&store_id='.$this->store->id)
            ->assertOk()
            ->assertJsonPath('data.summary.opening_balance', 0)
            ->assertJsonPath('data.summary.total_in', 2)
            ->assertJsonPath('data.summary.total_out', 1)
            ->assertJsonPath('data.summary.closing_balance', 1)
            ->assertJsonPath('data.rows.0.trans_code', 'GRN')
            ->assertJsonPath('data.rows.0.serial_numbers.0', 'SER-001');
    }

    public function test_sales_and_cash_flow_reports_return_detailed_rows(): void
    {
        app(StockService::class)->receiveStock(
            'GRN-SALE-001',
            'GRN',
            $this->batchItem->item_code,
            'SALE-001',
            $this->store->id,
            2,
            500,
            700,
            'HQ',
            'admin',
            ['SALE-SER-001', 'SALE-SER-002']
        );

        $invoice = app(SalesService::class)->createInvoice([
            'invoice_date' => '2026-07-01',
            'customer_code' => $this->customer->Code,
            'store_id' => $this->store->id,
            'cash_payment' => 700,
            'items' => [
                [
                    'item_code' => $this->batchItem->item_code,
                    'batch_no' => 'SALE-001',
                    'qty' => 1,
                    'serial_numbers' => ['SALE-SER-001'],
                ],
            ],
        ], $this->user);

        $this->getJson('/api/v1/reports/sales?mode=detail&customer_code='.$this->customer->Code)
            ->assertOk()
            ->assertJsonPath('data.mode', 'detail')
            ->assertJsonPath('data.rows.0.invoice_no', $invoice->Invoice_no)
            ->assertJsonPath('data.rows.0.item_code', $this->batchItem->item_code)
            ->assertJsonPath('data.rows.0.batch_no', 'SALE-001');

        $this->getJson('/api/v1/reports/cash-flow?account_code='.AccountingService::CASH.'&from=2026-07-01&to=2026-07-01')
            ->assertOk()
            ->assertJsonPath('data.account.code', AccountingService::CASH)
            ->assertJsonPath('data.summary.cash_in', 700);
    }
}
