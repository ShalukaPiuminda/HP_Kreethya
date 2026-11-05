<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Item;
use App\Models\ItemBatch;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class CustomerSnapshotSyncTest extends TestCase
{
    use RefreshDatabase;

    private Customer $customer;
    private Customer $otherCustomer;
    private Store $store;
    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();

        $role = Role::create(['name' => Role::SUPER_ADMIN, 'description' => 'Test administrator']);
        $user = User::create([
            'username' => 'admin',
            'email' => 'admin@example.com',
            'password' => 'password',
            'role_id' => $role->id,
            'BC' => 'HQ',
        ]);

        $this->customer = Customer::create([
            'Code' => 'CUST0001', 'name' => 'Eshan Typo', 'NIC' => '901234567V',
            'phone' => '0771234567', 'address' => 'Old Address', 'advance_balance' => 0,
            'BC' => 'HQ', 'UID' => 'admin',
        ]);
        $this->otherCustomer = Customer::create([
            'Code' => 'CUST0002', 'name' => 'Other Person', 'NIC' => '881234567V',
            'phone' => '0779999999', 'address' => 'Kandy', 'advance_balance' => 0,
            'BC' => 'HQ', 'UID' => 'admin',
        ]);

        $this->store = Store::create(['name' => 'Main Store', 'location' => 'HQ', 'BC' => 'HQ', 'UID' => 'admin']);
        $this->item = Item::create([
            'item_code' => 'ITM-BATCH', 'item_description' => 'Batch Television',
            'is_batch' => true, 'is_serialized' => false, 'reorder_level' => 1,
            'standard_purchase_price' => 0, 'standard_sales_price' => 0, 'BC' => 'HQ', 'UID' => 'admin',
        ]);
        ItemBatch::create([
            'batch_no' => 'SALE-BATCH', 'item_code' => $this->item->item_code, 'store_id' => $this->store->id,
            'purchase_price' => 350, 'sales_price' => 500, 'qty_in_hand' => 10, 'BC' => 'HQ', 'UID' => 'admin',
        ]);

        Sanctum::actingAs($user);
    }

    private function postInvoice(Customer $customer): string
    {
        return $this->postJson('/api/v1/sales-invoices', [
            'invoice_date' => '2026-11-04',
            'customer_code' => $customer->Code,
            'store_id' => $this->store->id,
            'cash_payment' => 200,
            'items' => [['item_code' => $this->item->item_code, 'batch_no' => 'SALE-BATCH', 'qty' => 1]],
        ])->assertCreated()->json('data.Invoice_no');
    }

    public function test_editing_customer_updates_copied_details_and_keeps_links(): void
    {
        $advanceNo = $this->postJson('/api/v1/customer-advances', [
            'payment_date' => '2026-11-04', 'customer_code' => $this->customer->Code,
            'amount' => 100, 'cash_payment' => 100,
        ])->assertCreated()->json('data.payment_no');

        $invoiceNo = $this->postInvoice($this->customer);
        $otherInvoiceNo = $this->postInvoice($this->otherCustomer);

        $paymentNo = $this->postJson('/api/v1/customer-payments', [
            'payment_date' => '2026-11-04', 'customer_code' => $this->customer->Code,
            'payment_amount' => 100, 'cash_payment' => 100,
            'allocations' => [['sales_invoice_no' => $invoiceNo, 'amount' => 100]],
        ])->assertCreated()->json('data.Payment_no');

        $amountsBefore = DB::table('t_invoice_sums')->where('Invoice_no', $invoiceNo)
            ->first(['Net_Amount', 'paid_amount', 'Credite', 'payment_status']);

        $this->putJson('/api/v1/customers/'.$this->customer->id, [
            'name' => 'R.M. Eshan Udayanga',
            'NIC' => '199012345678',
            'nic_change_reason' => 'New NIC card issued',
            'phone' => '0712345678',
            'address' => 'New Address',
        ])->assertOk();

        $this->assertDatabaseHas('t_invoice_sums', [
            'Invoice_no' => $invoiceNo,
            'Customer_Name' => 'R.M. Eshan Udayanga',
            'Customer_NIC' => '199012345678',
            'Customer_Phone' => '0712345678',
            'Customer_Address' => 'New Address',
        ]);
        // Records linked only by NIC follow the NIC change.
        $this->assertDatabaseHas('t_advanc_cus_payments', [
            'payment_no' => $advanceNo, 'customer_nic' => '199012345678', 'customer_name' => 'R.M. Eshan Udayanga',
        ]);
        $this->assertDatabaseHas('t_customer_payments', [
            'Payment_no' => $paymentNo, 'Customer_NIC' => '199012345678', 'Customer_Name' => 'R.M. Eshan Udayanga',
        ]);
        $customer = $this->customer->fresh();
        $this->assertSame(1, $customer->payments()->count());
        $this->assertSame(1, $customer->advances()->count());

        // Amounts are untouched.
        $this->assertEquals(
            $amountsBefore,
            DB::table('t_invoice_sums')->where('Invoice_no', $invoiceNo)
                ->first(['Net_Amount', 'paid_amount', 'Credite', 'payment_status'])
        );

        // Another customer's records are untouched.
        $this->assertDatabaseHas('t_invoice_sums', [
            'Invoice_no' => $otherInvoiceNo, 'Customer_Name' => 'Other Person', 'Customer_NIC' => '881234567V',
        ]);

        // Old values are logged.
        $this->assertDatabaseHas('customer_change_logs', [
            'customer_code' => 'CUST0001', 'source' => 'customer_update', 'table_name' => 't_invoice_sums', 'UID' => 'admin',
        ]);
        $log = DB::table('customer_change_logs')->where('table_name', 't_invoice_sums')->first();
        $this->assertSame('Eshan Typo', json_decode($log->old_values, true)['Customer_Name']);

        // Search by the new name finds the invoice.
        $this->getJson('/api/v1/sales-invoices?search=Udayanga')
            ->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.Invoice_no', $invoiceNo);
    }

    public function test_customer_nic_must_be_a_valid_sri_lankan_nic(): void
    {
        $base = ['name' => 'New Person', 'phone' => '0771112223', 'address' => 'Galle'];

        foreach (['12345', '12345678V', '901234567A', '9012345678', '903674567V', '199099904567', '210012304567'] as $invalid) {
            $this->postJson('/api/v1/customers', $base + ['NIC' => $invalid])
                ->assertStatus(422)
                ->assertJsonValidationErrors('NIC');
        }

        // Lowercase letter and spaces are normalised before saving.
        $this->postJson('/api/v1/customers', $base + ['NIC' => ' 95 1234567v '])
            ->assertCreated()
            ->assertJsonPath('data.NIC', '951234567V');

        // New 12-digit format, female day code (+500).
        $this->postJson('/api/v1/customers', $base + ['NIC' => '199567804567'])
            ->assertCreated();

        // The same NIC cannot be used for two customers, even typed differently.
        $this->postJson('/api/v1/customers', $base + ['NIC' => '951234567v'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('NIC');

        $this->postJson('/api/v1/guarantors', $base + ['NIC' => 'ABC123'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('NIC');
    }

    public function test_existing_invalid_nic_does_not_block_editing_other_details(): void
    {
        DB::table('customers')->where('id', $this->customer->id)->update(['NIC' => 'OLD-NIC-01']);
        $sale = [
            'invoice_date' => '2026-11-04', 'customer_code' => $this->customer->Code, 'store_id' => $this->store->id,
            'items' => [['item_code' => $this->item->item_code, 'batch_no' => 'SALE-BATCH', 'qty' => 1]],
        ];

        // An invalid legacy NIC blocks credit, but a fully paid sale is fine.
        $this->postJson('/api/v1/sales-invoices', $sale + ['cash_payment' => 200])
            ->assertStatus(422)
            ->assertJsonValidationErrors('customer_code');
        $invoiceNo = $this->postJson('/api/v1/sales-invoices', $sale + ['cash_payment' => 500])
            ->assertCreated()
            ->json('data.Invoice_no');

        // Name change with the legacy NIC untouched is allowed and flows to the invoice.
        $this->putJson('/api/v1/customers/'.$this->customer->id, [
            'name' => 'Corrected Name', 'NIC' => 'OLD-NIC-01',
        ])->assertOk();
        $this->assertDatabaseHas('t_invoice_sums', ['Invoice_no' => $invoiceNo, 'Customer_Name' => 'Corrected Name']);

        // Changing the NIC requires a valid one.
        $this->putJson('/api/v1/customers/'.$this->customer->id, ['NIC' => 'OLD-NIC-02'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('NIC');
        $this->putJson('/api/v1/customers/'.$this->customer->id, ['NIC' => '199012304567', 'nic_change_reason' => 'Typo correction'])
            ->assertOk();
        $this->assertDatabaseHas('t_invoice_sums', ['Invoice_no' => $invoiceNo, 'Customer_NIC' => '199012304567']);
    }

    private function actingAsRole(string $roleName, array $permissions): User
    {
        $role = Role::create(['name' => $roleName, 'description' => $roleName]);
        foreach ($permissions as $module => $canUpdate) {
            RolePermission::create([
                'role_id' => $role->id, 'module' => $module,
                'can_create' => true, 'can_read' => true, 'can_update' => $canUpdate, 'can_delete' => false,
                'BC' => 'HQ', 'UID' => 'system',
            ]);
        }
        $user = User::create([
            'username' => strtolower($roleName), 'email' => strtolower($roleName).'@example.com',
            'password' => 'password', 'role_id' => $role->id, 'BC' => 'HQ',
        ]);
        Sanctum::actingAs($user);

        return $user;
    }

    public function test_customer_without_credit_or_hp_can_change_nic_freely(): void
    {
        // Fully paid invoice: not a credit sale, so the NIC stays unlocked.
        $this->postJson('/api/v1/sales-invoices', [
            'invoice_date' => '2026-11-04', 'customer_code' => $this->customer->Code,
            'store_id' => $this->store->id, 'cash_payment' => 500,
            'items' => [['item_code' => $this->item->item_code, 'batch_no' => 'SALE-BATCH', 'qty' => 1]],
        ])->assertCreated();

        $this->actingAsRole('Clerk', ['customers' => true]);

        $this->getJson('/api/v1/customers/'.$this->customer->id)
            ->assertOk()
            ->assertJsonPath('data.nic_locked', false);

        $this->putJson('/api/v1/customers/'.$this->customer->id, ['NIC' => '199012304567'])
            ->assertOk();
        $this->assertDatabaseHas('customer_change_logs', [
            'customer_code' => 'CUST0001', 'table_name' => 'customers', 'UID' => 'clerk', 'reason' => null,
        ]);
    }

    public function test_nic_is_locked_after_credit_sale_for_users_without_edit_nic_permission(): void
    {
        $this->postInvoice($this->customer); // cash 200 of 500: credit sale

        $this->actingAsRole('Manager', ['customers' => true]);

        $this->getJson('/api/v1/customers?per_page=50')
            ->assertOk()
            ->assertJsonPath('data.0.Code', 'CUST0001')
            ->assertJsonPath('data.0.nic_locked', true)
            ->assertJsonPath('data.1.nic_locked', false);

        $this->putJson('/api/v1/customers/'.$this->customer->id, [
            'NIC' => '199012304567', 'nic_change_reason' => 'Typo correction',
        ])->assertStatus(422)->assertJsonValidationErrors('NIC');
        $this->assertDatabaseHas('customers', ['id' => $this->customer->id, 'NIC' => '901234567V']);

        // Other details can still be edited, and are logged with the user.
        $this->putJson('/api/v1/customers/'.$this->customer->id, [
            'name' => 'Eshan Fixed', 'NIC' => '901234567V',
        ])->assertOk();
        $this->assertDatabaseHas('customer_change_logs', [
            'customer_code' => 'CUST0001', 'table_name' => 'customers', 'UID' => 'manager',
        ]);
    }

    public function test_edit_nic_permission_allows_locked_change_with_reason(): void
    {
        $invoiceNo = $this->postInvoice($this->customer);

        $this->actingAsRole('Manager', ['customers' => true, 'customer-nic' => true]);

        $this->putJson('/api/v1/customers/'.$this->customer->id, ['NIC' => '199012304567'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('nic_change_reason');

        $this->putJson('/api/v1/customers/'.$this->customer->id, [
            'NIC' => '199012304567', 'nic_change_reason' => 'New NIC card issued',
        ])->assertOk();

        $this->assertDatabaseHas('t_invoice_sums', ['Invoice_no' => $invoiceNo, 'Customer_NIC' => '199012304567']);

        $log = DB::table('customer_change_logs')->where('table_name', 'customers')->first();
        $this->assertSame('manager', $log->UID);
        $this->assertSame('New NIC card issued', $log->reason);
        $this->assertSame(['NIC' => '901234567V'], json_decode($log->old_values, true));
        $this->assertSame(['NIC' => '199012304567'], json_decode($log->new_values, true));
        $this->assertDatabaseHas('customer_change_logs', [
            'table_name' => 't_invoice_sums', 'reason' => 'New NIC card issued', 'UID' => 'manager',
        ]);
    }

    public function test_customer_can_be_created_without_nic_but_entered_nic_must_be_valid(): void
    {
        $base = ['phone' => '0771112223', 'address' => 'Galle'];

        $this->postJson('/api/v1/customers', $base + ['name' => 'Cash One'])
            ->assertCreated()
            ->assertJsonPath('data.NIC', null);
        // Empty text is stored as NULL, so several NIC-less customers can exist.
        $this->postJson('/api/v1/customers', $base + ['name' => 'Cash Two', 'NIC' => '  '])
            ->assertCreated()
            ->assertJsonPath('data.NIC', null);

        $this->postJson('/api/v1/customers', $base + ['name' => 'Bad NIC', 'NIC' => '0000000000'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('NIC');
    }

    public function test_customer_without_nic_can_buy_cash_but_not_credit_or_hp(): void
    {
        $cashCustomer = Customer::create([
            'Code' => 'CUST0003', 'name' => 'Walk-in Cash', 'NIC' => null,
            'advance_balance' => 0, 'BC' => 'HQ', 'UID' => 'admin',
        ]);

        // Advance is linked by customer code and can be used on a fully paid sale.
        $this->postJson('/api/v1/customer-advances', [
            'payment_date' => '2026-11-04', 'customer_code' => 'CUST0003',
            'amount' => 100, 'cash_payment' => 100,
        ])->assertCreated()->assertJsonPath('data.customer_code', 'CUST0003');

        $this->postJson('/api/v1/sales-invoices', [
            'invoice_date' => '2026-11-04', 'customer_code' => 'CUST0003',
            'store_id' => $this->store->id, 'advance_amount' => 100, 'cash_payment' => 400,
            'items' => [['item_code' => $this->item->item_code, 'batch_no' => 'SALE-BATCH', 'qty' => 1]],
        ])->assertCreated()
            ->assertJsonPath('data.payment_status', 'paid')
            ->assertJsonPath('data.Customer_NIC', null);
        $this->assertSame(1, $cashCustomer->fresh()->advances()->count());

        // Anything left on credit needs a valid NIC.
        $this->postJson('/api/v1/sales-invoices', [
            'invoice_date' => '2026-11-04', 'customer_code' => 'CUST0003',
            'store_id' => $this->store->id, 'cash_payment' => 200,
            'items' => [['item_code' => $this->item->item_code, 'batch_no' => 'SALE-BATCH', 'qty' => 1]],
        ])->assertStatus(422)->assertJsonValidationErrors('customer_code');

        // HP needs a valid NIC too (checked before anything else is created).
        try {
            app(\App\Services\HPService::class)->createAgreement(['customer_code' => 'CUST0003'], User::where('username', 'admin')->first());
            $this->fail('HP agreement was allowed for a customer without a NIC.');
        } catch (\Illuminate\Validation\ValidationException $exception) {
            $this->assertArrayHasKey('customer_code', $exception->errors());
        }
        $this->assertDatabaseCount('t_hire_purchase_sums', 0);

        // Once a valid NIC is added, credit is allowed (customer is not locked yet: no credit so far).
        $this->putJson('/api/v1/customers/'.$cashCustomer->id, ['NIC' => '951234567V'])->assertOk();
        $this->postJson('/api/v1/sales-invoices', [
            'invoice_date' => '2026-11-04', 'customer_code' => 'CUST0003',
            'store_id' => $this->store->id, 'cash_payment' => 200,
            'items' => [['item_code' => $this->item->item_code, 'batch_no' => 'SALE-BATCH', 'qty' => 1]],
        ])->assertCreated();
        $this->assertDatabaseHas('t_invoice_sums', ['customer_code' => 'CUST0003', 'Customer_NIC' => '951234567V', 'payment_status' => 'paid']);
    }

    public function test_locked_customer_nic_cannot_be_removed(): void
    {
        $this->postInvoice($this->customer); // credit sale

        $this->putJson('/api/v1/customers/'.$this->customer->id, ['NIC' => '', 'nic_change_reason' => 'Remove it please'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('NIC');
        $this->assertDatabaseHas('customers', ['id' => $this->customer->id, 'NIC' => '901234567V']);
    }

    public function test_sync_command_dry_run_changes_nothing_and_apply_fixes_stale_records(): void
    {
        $invoiceNo = $this->postInvoice($this->customer);

        // Simulate an edit made before this fix existed (bypassing the controller).
        DB::table('customers')->where('id', $this->customer->id)->update(['name' => 'Corrected Name']);

        $this->artisan('customers:sync-snapshots')->assertSuccessful();
        $this->assertDatabaseHas('t_invoice_sums', ['Invoice_no' => $invoiceNo, 'Customer_Name' => 'Eshan Typo']);
        $this->assertDatabaseCount('customer_change_logs', 0);

        $this->artisan('customers:sync-snapshots --apply')->assertSuccessful();
        $this->assertDatabaseHas('t_invoice_sums', ['Invoice_no' => $invoiceNo, 'Customer_Name' => 'Corrected Name']);
        $this->assertDatabaseHas('customer_change_logs', [
            'customer_code' => 'CUST0001', 'source' => 'sync_command', 'table_name' => 't_invoice_sums',
        ]);

        // Running again finds nothing left to change.
        $this->artisan('customers:sync-snapshots')
            ->expectsOutputToContain('Nothing to do')
            ->assertSuccessful();
    }
}
