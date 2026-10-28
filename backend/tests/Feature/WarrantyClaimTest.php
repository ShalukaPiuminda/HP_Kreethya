<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Item;
use App\Models\MGuarantor;
use App\Models\MSchema;
use App\Models\Role;
use App\Models\RolePermission;
use App\Models\Store;
use App\Models\TCustomerAccountTrance;
use App\Models\TItemSerialMovement;
use App\Models\TServiceReturn;
use App\Models\User;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class WarrantyClaimTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Customer $customer;
    private Store $store;
    private Item $phone;
    private Item $cable;

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
            'Code' => 'CUS-W-1',
            'name' => 'Warranty Customer',
            'NIC' => '901111111V',
            'phone' => '0771111111',
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
        $this->phone = Item::create([
            'item_code' => 'PHONE-1',
            'item_description' => 'Smart Phone',
            'is_batch' => false,
            'is_serialized' => true,
            'warranty_enabled' => true,
            'warranty_months' => 12,
            'reorder_level' => 0,
            'standard_purchase_price' => 700,
            'standard_sales_price' => 1000,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);
        $this->cable = Item::create([
            'item_code' => 'CABLE-1',
            'item_description' => 'USB Cable',
            'is_batch' => false,
            'is_serialized' => false,
            'reorder_level' => 0,
            'standard_purchase_price' => 5,
            'standard_sales_price' => 10,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        $stock = app(StockService::class);
        $stock->receiveStock('GRN-W', 'GRN', 'PHONE-1', null, $this->store->id, 4, 700, 1000, 'HQ', 'admin', ['PH-1', 'PH-2', 'PH-3', 'PH-4']);
        $stock->receiveStock('GRN-W', 'GRN', 'CABLE-1', null, $this->store->id, 10, 5, 10, 'HQ', 'admin');

        Sanctum::actingAs($this->user);
    }

    public function test_item_with_warranty_requires_a_period(): void
    {
        $this->postJson('/api/v1/items', [
            'item_description' => 'Laptop',
            'warranty_enabled' => true,
            'standard_purchase_price' => 100,
            'standard_sales_price' => 150,
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('warranty_months');

        $this->postJson('/api/v1/items', [
            'item_description' => 'Laptop',
            'warranty_enabled' => true,
            'warranty_months' => 24,
            'standard_purchase_price' => 100,
            'standard_sales_price' => 150,
        ])->assertCreated()
            ->assertJsonPath('data.warranty_enabled', true)
            ->assertJsonPath('data.warranty_months', 24);
    }

    public function test_sale_lines_record_warranty_expiry_and_ignore_it_for_non_warranty_items(): void
    {
        $invoice = $this->sell(now()->subMonth()->toDateString(), [
            ['item_code' => 'PHONE-1', 'qty' => 1, 'serial_numbers' => ['PH-1'], 'warranty_months' => 6],
            ['item_code' => 'CABLE-1', 'qty' => 1, 'warranty_enabled' => true, 'warranty_months' => 12],
        ]);

        $this->assertSame(true, $invoice['details'][0]['warranty_enabled']);
        $this->assertSame(6, $invoice['details'][0]['warranty_months']);
        $this->assertSame(now()->subMonth()->addMonthsNoOverflow(6)->toDateString(), $invoice['details'][0]['warranty_expiry_date']);
        $this->assertSame(false, $invoice['details'][1]['warranty_enabled']);
        $this->assertNull($invoice['details'][1]['warranty_expiry_date']);
    }

    public function test_lookup_flags_expired_and_unticked_lines_as_not_eligible(): void
    {
        $this->sell(now()->subYears(2)->toDateString(), [
            ['item_code' => 'PHONE-1', 'qty' => 1, 'serial_numbers' => ['PH-1']],
        ]);
        $this->sell(now()->toDateString(), [
            ['item_code' => 'PHONE-1', 'qty' => 1, 'serial_numbers' => ['PH-2'], 'warranty_enabled' => false],
        ]);

        $this->getJson('/api/v1/warranty-claims/lookup?serial=PH-1')
            ->assertOk()
            ->assertJsonPath('data.0.eligible', false)
            ->assertJsonPath('data.0.reason', 'Warranty expired on '.now()->subYears(2)->addMonthsNoOverflow(12)->toDateString().'.');

        $this->getJson('/api/v1/warranty-claims/lookup?serial=PH-2')
            ->assertOk()
            ->assertJsonPath('data.0.eligible', false)
            ->assertJsonPath('data.0.reason', 'This item was sold without warranty.');
    }

    public function test_repaired_unit_stays_blocked_until_handover_and_history_shows_the_repair(): void
    {
        $invoice = $this->sell(now()->toDateString(), [
            ['item_code' => 'PHONE-1', 'qty' => 1, 'serial_numbers' => ['PH-1']],
        ]);
        $detailId = $invoice['details'][0]['id'];

        $claim = $this->receive($detailId, 'PH-1')
            ->assertCreated()
            ->assertJsonPath('data.status', 'received')
            ->json('data');

        // The unit is now with us: it cannot be received again.
        $this->receive($detailId, 'PH-1')
            ->assertUnprocessable()
            ->assertJsonPath('errors.source_detail_id.0', "Item is with us under warranty claim {$claim['claim_no']} (received).");

        $claim = $this->decide($claim['id'], 'repair')
            ->assertOk()
            ->assertJsonPath('data.status', 'in_repair')
            ->json('data');
        $ticket = TServiceReturn::query()->where('ticket_no', $claim['service_ticket_no'])->firstOrFail();
        $this->assertTrue($ticket->is_warranty);

        $this->postJson("/api/v1/service-tickets/{$ticket->id}/assign-technician", [
            'technician_name' => 'Tech Nimal',
            'issue_date' => now()->toDateString(),
        ])->assertOk();
        $this->postJson("/api/v1/service-tickets/{$ticket->id}/complete-repair", [
            'completed_date' => now()->toDateString(),
            'repair_details' => 'Replaced charging port',
            'parts_used' => 'Charging port',
        ])->assertOk();

        $this->getJson("/api/v1/warranty-claims/{$claim['id']}")
            ->assertOk()
            ->assertJsonPath('data.claim.status', 'ready_for_pickup');

        // Repaired but still in the shop: still not claimable.
        $this->getJson('/api/v1/warranty-claims/lookup?serial=PH-1')
            ->assertJsonPath('data.0.eligible', false)
            ->assertJsonPath('data.0.custody_claim.status', 'ready_for_pickup');

        // Warranty work is never invoiced to the customer.
        $this->postJson("/api/v1/service-tickets/{$ticket->id}/invoice", [
            'invoice_date' => now()->toDateString(),
            'service_charge' => 500,
        ])->assertUnprocessable();

        $this->handover($claim['id'])
            ->assertOk()
            ->assertJsonPath('data.status', 'delivered')
            ->assertJsonPath('data.collected_by', 'Warranty Customer');

        $this->assertSame('completed', $ticket->fresh()->status);
        $this->assertDatabaseMissing('t_service_invoices', ['ticket_no' => $ticket->ticket_no]);
        $this->assertSame(0, TCustomerAccountTrance::query()->where('trance_no', 'like', 'SIV%')->count());

        // Back with the customer: a new claim is allowed and history shows the earlier repair.
        $this->getJson('/api/v1/warranty-claims/lookup?serial=PH-1')
            ->assertJsonPath('data.0.eligible', true)
            ->assertJsonPath('data.0.claim_count', 1);
        $this->receive($detailId, 'PH-1')->assertCreated();

        $this->getJson("/api/v1/warranty-claims/history?source_type=invoice&source_detail_id={$detailId}&serial=PH-1")
            ->assertOk()
            ->assertJsonCount(2, 'data.claims')
            ->assertJsonPath('data.claims.1.service_ticket.issues.0.repair_details', 'Replaced charging port')
            ->assertJsonPath('data.claims.1.service_ticket.issues.0.technician_name', 'Tech Nimal');
    }

    public function test_replace_hands_over_a_new_unit_that_keeps_the_original_expiry(): void
    {
        $invoice = $this->sell(now()->subMonths(3)->toDateString(), [
            ['item_code' => 'PHONE-1', 'qty' => 1, 'serial_numbers' => ['PH-1']],
        ]);
        $detailId = $invoice['details'][0]['id'];
        $claim = $this->receive($detailId, 'PH-1')->json('data');

        $this->decide($claim['id'], 'replace', ['replacement_serial_no' => 'PH-3'])
            ->assertOk()
            ->assertJsonPath('data.status', 'delivered')
            ->assertJsonPath('data.replacement_serial_no', 'PH-3');

        $this->assertDatabaseHas('t_item_serial_movements', [
            'trans_code' => 'WARRANTY-REPLACE',
            'item_serial_no' => 'PH-3',
            'qun_out' => 1,
        ]);

        $this->getJson('/api/v1/warranty-claims/lookup?serial=PH-3')
            ->assertOk()
            ->assertJsonPath('data.0.item_serial_no', 'PH-3')
            ->assertJsonPath('data.0.sold_serial_no', 'PH-1')
            ->assertJsonPath('data.0.warranty_expiry_date', now()->subMonths(3)->addMonthsNoOverflow(12)->toDateString())
            ->assertJsonPath('data.0.eligible', true);

        // The faulty PH-1 is no longer the customer's unit.
        $this->receive($detailId, 'PH-1')->assertUnprocessable();
        $this->receive($detailId, 'PH-3')->assertCreated();
    }

    public function test_refund_posts_a_sales_return_without_restocking_the_faulty_unit(): void
    {
        $invoice = $this->sell(now()->toDateString(), [
            ['item_code' => 'PHONE-1', 'qty' => 1, 'serial_numbers' => ['PH-1']],
        ]);
        $claim = $this->receive($invoice['details'][0]['id'], 'PH-1')->json('data');

        $claim = $this->decide($claim['id'], 'refund', ['refund_method' => 'cash'])
            ->assertOk()
            ->assertJsonPath('data.status', 'refunded')
            ->json('data');

        $this->assertDatabaseHas('t_sales_return_sums', ['return_no' => $claim['sales_return_no']]);
        $this->assertSame(0, TItemSerialMovement::query()->where('trans_no', $claim['sales_return_no'])->count());
        $this->getJson('/api/v1/warranty-claims/lookup?serial=PH-1')
            ->assertJsonPath('data.0.reason', 'This item has already been returned.');
    }

    public function test_rejected_claim_returns_unrepaired_or_continues_as_paid_service(): void
    {
        $invoice = $this->sell(now()->toDateString(), [
            ['item_code' => 'PHONE-1', 'qty' => 1, 'serial_numbers' => ['PH-1']],
            ['item_code' => 'PHONE-1', 'qty' => 1, 'serial_numbers' => ['PH-2']],
        ]);

        // Rejected at inspection: the unit waits for pickup, then goes back unrepaired.
        $first = $this->receive($invoice['details'][0]['id'], 'PH-1')->json('data');
        $this->decide($first['id'], 'reject')->assertUnprocessable()->assertJsonValidationErrors('outcome_note');
        $this->decide($first['id'], 'reject', ['outcome_note' => 'Liquid damage'])
            ->assertOk()
            ->assertJsonPath('data.status', 'ready_for_pickup');
        $this->handover($first['id'])->assertOk()->assertJsonPath('data.status', 'delivered');

        // Rejected during repair: the ticket becomes a paid job and still holds the unit.
        $second = $this->receive($invoice['details'][1]['id'], 'PH-2')->json('data');
        $second = $this->decide($second['id'], 'repair')->json('data');
        $this->postJson("/api/v1/warranty-claims/{$second['id']}/reject", ['reason' => 'Tampered seal'])
            ->assertOk()
            ->assertJsonPath('data.status', 'rejected');

        $ticket = TServiceReturn::query()->where('ticket_no', $second['service_ticket_no'])->firstOrFail();
        $this->assertFalse($ticket->is_warranty);
        $this->getJson('/api/v1/warranty-claims/lookup?serial=PH-2')
            ->assertJsonPath('data.0.eligible', false)
            ->assertJsonPath('data.0.reason', "Item is with us under service ticket {$ticket->ticket_no}.");
    }

    public function test_open_paid_service_ticket_blocks_a_warranty_claim(): void
    {
        $invoice = $this->sell(now()->toDateString(), [
            ['item_code' => 'PHONE-1', 'qty' => 1, 'serial_numbers' => ['PH-1']],
        ]);
        $this->postJson('/api/v1/service-tickets', [
            'return_date' => now()->toDateString(),
            'customer_code' => $this->customer->Code,
            'item_code' => 'PHONE-1',
            'item_serial_no' => 'PH-1',
            'problem_description' => 'Screen cracked',
        ])->assertCreated();

        $this->receive($invoice['details'][0]['id'], 'PH-1')->assertUnprocessable();
    }

    public function test_hire_purchase_lines_carry_warranty_and_cannot_be_refunded_from_a_claim(): void
    {
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
        $guarantor = MGuarantor::create([
            'Code' => 'GUA-W-1',
            'name' => 'Guarantor',
            'NIC' => '882222222V',
            'phone' => '0772222222',
            'address' => 'Colombo',
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        $agreement = $this->postJson('/api/v1/hp', [
            'invoice_date' => now()->toDateString(),
            'customer_code' => $this->customer->Code,
            'guarantor_1_code' => $guarantor->Code,
            'schema_type' => 'HP-4',
            'store_id' => $this->store->id,
            'down_payment' => 200,
            'down_payment_method' => 'cash',
            'instalment_due_date' => 1,
            'items' => [
                ['item_code' => 'PHONE-1', 'qty' => 1, 'serial_numbers' => ['PH-4'], 'warranty_months' => 24],
            ],
        ])->assertCreated()
            ->assertJsonPath('data.details.0.warranty_enabled', true)
            ->assertJsonPath('data.details.0.warranty_expiry_date', now()->addMonthsNoOverflow(24)->toDateString())
            ->json('data');

        $detailId = $agreement['details'][0]['id'];
        $this->getJson('/api/v1/warranty-claims/lookup?serial=PH-4')
            ->assertJsonPath('data.0.source_type', 'hp')
            ->assertJsonPath('data.0.eligible', true);

        $claim = $this->receive($detailId, 'PH-4', [], 'hp')->assertCreated()->json('data');
        $this->decide($claim['id'], 'refund')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('resolution');
        $this->decide($claim['id'], 'replace', ['replacement_serial_no' => 'PH-2'])
            ->assertOk()
            ->assertJsonPath('data.status', 'delivered');
    }

    public function test_user_without_warranty_permission_is_forbidden(): void
    {
        $role = Role::create(['name' => 'Clerk', 'description' => 'Clerk']);
        RolePermission::create([
            'role_id' => $role->id,
            'module' => 'sales',
            'can_create' => true,
            'can_read' => true,
            'can_update' => false,
            'can_delete' => false,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);
        $clerk = User::create([
            'username' => 'clerk',
            'email' => 'clerk@example.com',
            'password' => 'password',
            'role_id' => $role->id,
            'BC' => 'HQ',
        ]);
        Sanctum::actingAs($clerk);

        $this->getJson('/api/v1/warranty-claims')->assertForbidden();
    }

    public function test_warranty_report_lists_expiring_units_and_claims_by_item(): void
    {
        // Expires in about 10 days, inside the 30-day window.
        $soon = $this->sell(now()->subMonths(12)->addDays(10)->toDateString(), [
            ['item_code' => 'PHONE-1', 'qty' => 1, 'serial_numbers' => ['PH-1']],
        ]);
        // Expires in about 11 months, outside the window.
        $later = $this->sell(now()->subMonth()->toDateString(), [
            ['item_code' => 'PHONE-1', 'qty' => 1, 'serial_numbers' => ['PH-2']],
        ]);

        $this->getJson('/api/v1/reports/warranty?view=expiring&days=30')
            ->assertOk()
            ->assertJsonCount(1, 'data.rows')
            ->assertJsonPath('data.rows.0.invoice_no', $soon['Invoice_no'])
            ->assertJsonPath('data.rows.0.status', 'Active');

        $repair = $this->receive($later['details'][0]['id'], 'PH-2')->json('data');
        $this->decide($repair['id'], 'repair')->assertOk();
        $reject = $this->receive($soon['details'][0]['id'], 'PH-1')->json('data');
        $this->decide($reject['id'], 'reject', ['outcome_note' => 'Liquid damage'])->assertOk();
        $this->handover($reject['id'])->assertOk();

        $this->getJson('/api/v1/reports/warranty?view=claims_by_item')
            ->assertOk()
            ->assertJsonPath('data.rows.0.item_code', 'PHONE-1')
            ->assertJsonPath('data.rows.0.units_sold', 2)
            ->assertJsonPath('data.rows.0.total_claims', 2)
            ->assertJsonPath('data.rows.0.repair', 1)
            ->assertJsonPath('data.rows.0.rejected', 1)
            ->assertJsonPath('data.rows.0.open', 1)
            ->assertJsonPath('data.rows.0.claim_rate', 100);

        $this->getJson('/api/v1/reports/warranty?view=register&search=PH-2')
            ->assertOk()
            ->assertJsonCount(1, 'data.rows')
            ->assertJsonPath('data.rows.0.status', 'With us');
    }

    private function sell(string $date, array $items): array
    {
        return $this->postJson('/api/v1/sales-invoices', [
            'invoice_date' => $date,
            'customer_code' => $this->customer->Code,
            'store_id' => $this->store->id,
            'items' => $items,
        ])->assertCreated()->json('data');
    }

    private function receive(int $detailId, ?string $serial, array $extra = [], string $sourceType = 'invoice'): TestResponse
    {
        return $this->postJson('/api/v1/warranty-claims', [
            'claim_date' => now()->toDateString(),
            'source_type' => $sourceType,
            'source_detail_id' => $detailId,
            'item_serial_no' => $serial,
            'problem_description' => 'Does not power on',
            'accessories_received' => 'Charger',
            ...$extra,
        ]);
    }

    private function decide(int $claimId, string $resolution, array $extra = []): TestResponse
    {
        return $this->postJson("/api/v1/warranty-claims/{$claimId}/decide", [
            'decision_date' => now()->toDateString(),
            'resolution' => $resolution,
            ...$extra,
        ]);
    }

    private function handover(int $claimId): TestResponse
    {
        return $this->postJson("/api/v1/warranty-claims/{$claimId}/handover", [
            'delivered_date' => now()->toDateString(),
        ]);
    }
}
