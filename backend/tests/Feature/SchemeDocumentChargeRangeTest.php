<?php

namespace Tests\Feature;

use App\Models\BankBranch;
use App\Models\BankDetail;
use App\Models\Customer;
use App\Models\Item;
use App\Models\MGuarantor;
use App\Models\MSchema;
use App\Models\MSchemaDocumentChargeRange;
use App\Models\Role;
use App\Models\Store;
use App\Models\User;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class SchemeDocumentChargeRangeTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Customer $customer;
    private Store $store;
    private Item $item;
    private MGuarantor $guarantor;

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

        $this->customer = Customer::create([
            'Code' => 'CUS-DOC-1',
            'name' => 'Doc Customer',
            'NIC' => '901111111V',
            'phone' => '0771111111',
            'address' => 'Colombo',
            'advance_balance' => 0,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        $this->guarantor = MGuarantor::create([
            'Code' => 'GUA-DOC-1',
            'name' => 'Doc Guarantor',
            'NIC' => '882222222V',
            'phone' => '0772222222',
            'address' => 'Colombo',
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
            'item_code' => 'ITM-DOC-1',
            'item_description' => 'Doc Item',
            'is_batch' => false,
            'is_serialized' => false,
            'reorder_level' => 0,
            'standard_purchase_price' => 5000,
            'standard_sales_price' => 10000,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        app(StockService::class)->receiveStock(
            'OPEN-DOC',
            'OPENING',
            $this->item->item_code,
            null,
            $this->store->id,
            10,
            5000,
            10000,
            'HQ',
            'admin'
        );
    }

    public function test_scheme_api_creates_fixed_and_range_schemes(): void
    {
        // 1. Create Fixed Document Charge Scheme
        $fixedRes = $this->postJson('/api/v1/schemas', [
            'SchemaType' => 'HP-FIXED',
            'DownpaymentPrecentage' => 20,
            'InstallmentRate' => 10,
            'NoOfInstallment' => 6,
            'DocumentChargeType' => 'fixed',
            'DocumentChargeAmount' => 750,
            'PanaltyCharage' => 2.5,
            'GracePeriodDays' => 5,
        ])->assertCreated()
            ->assertJsonPath('data.DocumentChargeType', 'fixed')
            ->assertJsonPath('data.DocumentChargeAmount', '750.00');

        $this->assertDatabaseHas('m_schemas', [
            'SchemaType' => 'HP-FIXED',
            'DocumentChargeType' => 'fixed',
            'DocumentChargeAmount' => 750,
        ]);

        // 2. Create Range Document Charge Scheme with multiple tiers
        $rangeRes = $this->postJson('/api/v1/schemas', [
            'SchemaType' => 'HP-TIERED',
            'DownpaymentPrecentage' => 10,
            'InstallmentRate' => 12,
            'NoOfInstallment' => 4,
            'DocumentChargeType' => 'range',
            'PanaltyCharage' => 3,
            'GracePeriodDays' => 5,
            'ranges' => [
                [
                    'from_amount' => 100,
                    'to_amount' => 5000,
                    'charge_type' => 'percentage',
                    'charge_value' => 2,
                ],
                [
                    'from_amount' => 5001,
                    'to_amount' => 20000,
                    'charge_type' => 'fixed',
                    'charge_value' => 500,
                ],
            ],
        ])->assertCreated()
            ->assertJsonPath('data.DocumentChargeType', 'range')
            ->assertJsonCount(2, 'data.document_charge_ranges');

        $schemaId = $rangeRes->json('data.id');
        $this->assertDatabaseHas('m_schema_document_charge_ranges', [
            'schema_id' => $schemaId,
            'from_amount' => 100,
            'to_amount' => 5000,
            'charge_type' => 'percentage',
            'charge_value' => 2,
        ]);
        $this->assertDatabaseHas('m_schema_document_charge_ranges', [
            'schema_id' => $schemaId,
            'from_amount' => 5001,
            'to_amount' => 20000,
            'charge_type' => 'fixed',
            'charge_value' => 500,
        ]);

        // 3. Update Scheme ranges and test boolean string acceptance ("true", "false", "1", "0")
        $this->putJson("/api/v1/schemas/{$schemaId}", [
            'IncludeDocumentCharge' => 'false',
            'DownpaymentRequired' => '1',
            'CollectFirstInstallment' => 'true',
            'ranges' => [
                [
                    'from_amount' => 200,
                    'to_amount' => 8000,
                    'charge_type' => 'percentage',
                    'charge_value' => 2.5,
                ],
            ],
        ])->assertOk()
            ->assertJsonPath('data.IncludeDocumentCharge', false)
            ->assertJsonPath('data.DownpaymentRequired', true)
            ->assertJsonPath('data.CollectFirstInstallment', true)
            ->assertJsonCount(1, 'data.document_charge_ranges')
            ->assertJsonPath('data.document_charge_ranges.0.from_amount', '200.00');

        $this->assertEquals(1, MSchemaDocumentChargeRange::where('schema_id', $schemaId)->count());
    }

    public function test_scheme_api_validates_range_errors_and_overlaps(): void
    {
        // Missing ranges when charge type is range
        $this->postJson('/api/v1/schemas', [
            'SchemaType' => 'HP-INVALID-1',
            'DownpaymentPrecentage' => 20,
            'InstallmentRate' => 10,
            'NoOfInstallment' => 6,
            'DocumentChargeType' => 'range',
            'PanaltyCharage' => 2.5,
        ])->assertStatus(422)
            ->assertJsonValidationErrors('ranges');

        // Overlapping ranges
        $this->postJson('/api/v1/schemas', [
            'SchemaType' => 'HP-INVALID-2',
            'DownpaymentPrecentage' => 20,
            'InstallmentRate' => 10,
            'NoOfInstallment' => 6,
            'DocumentChargeType' => 'range',
            'PanaltyCharage' => 2.5,
            'ranges' => [
                [
                    'from_amount' => 100,
                    'to_amount' => 5000,
                    'charge_type' => 'percentage',
                    'charge_value' => 2,
                ],
                [
                    'from_amount' => 4500,
                    'to_amount' => 10000,
                    'charge_type' => 'fixed',
                    'charge_value' => 200,
                ],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors('ranges');

        // From >= To
        $this->postJson('/api/v1/schemas', [
            'SchemaType' => 'HP-INVALID-3',
            'DownpaymentPrecentage' => 20,
            'InstallmentRate' => 10,
            'NoOfInstallment' => 6,
            'DocumentChargeType' => 'range',
            'PanaltyCharage' => 2.5,
            'ranges' => [
                [
                    'from_amount' => 5000,
                    'to_amount' => 5000,
                    'charge_type' => 'fixed',
                    'charge_value' => 200,
                ],
            ],
        ])->assertStatus(422)
            ->assertJsonValidationErrors('ranges.0.to_amount');
    }

    public function test_scheme_deletion_cascades_to_ranges(): void
    {
        $schema = MSchema::create([
            'SchemaType' => 'HP-DEL-CASCADE',
            'DownpaymentPrecentage' => 20,
            'InstallmentRate' => 10,
            'NoOfInstallment' => 6,
            'DocumentChargeType' => 'range',
            'PanaltyCharage' => 2.5,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        $schema->documentChargeRanges()->create([
            'from_amount' => 100,
            'to_amount' => 5000,
            'charge_type' => 'fixed',
            'charge_value' => 300,
            'BC' => 'HQ',
        ]);

        $this->assertEquals(1, MSchemaDocumentChargeRange::where('schema_id', $schema->id)->count());

        $this->deleteJson("/api/v1/schemas/{$schema->id}")->assertOk();

        $this->assertEquals(0, MSchemaDocumentChargeRange::where('schema_id', $schema->id)->count());
    }

    public function test_hp_calculate_with_fixed_and_range_schemes(): void
    {
        // 1. Fixed scheme calculation: net 10,000, downpayment 2,000 -> principal 8,000. Doc charge is fixed 600.
        MSchema::create([
            'SchemaType' => 'HP-DOC-FIXED',
            'DownpaymentPrecentage' => 20,
            'InstallmentRate' => 10,
            'NoOfInstallment' => 4,
            'DocumentChargeType' => 'fixed',
            'DocumentChargeAmount' => 600,
            'PanaltyCharage' => 2.5,
            'GracePeriodDays' => 5,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        $res = $this->postJson('/api/v1/hp/calculate', [
            'schema_type' => 'HP-DOC-FIXED',
            'net_amount' => 10000,
            'down_payment' => 2000,
        ])->assertOk();

        $this->assertEquals(600, $res->json('data.document_charge'));
        $this->assertEquals('fixed', $res->json('data.document_charge_type'));

        // 2. Tiered range scheme calculation
        $tiered = MSchema::create([
            'SchemaType' => 'HP-DOC-TIERED',
            'DownpaymentPrecentage' => 20,
            'InstallmentRate' => 10,
            'NoOfInstallment' => 4,
            'DocumentChargeType' => 'range',
            'PanaltyCharage' => 2.5,
            'GracePeriodDays' => 5,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        // Tier 1: 100 - 5,000 => 2%
        $tiered->documentChargeRanges()->create([
            'from_amount' => 100,
            'to_amount' => 5000,
            'charge_type' => 'percentage',
            'charge_value' => 2,
            'BC' => 'HQ',
        ]);

        // Tier 2: 5,001 - 20,000 => fixed LKR 400
        $tiered->documentChargeRanges()->create([
            'from_amount' => 5001,
            'to_amount' => 20000,
            'charge_type' => 'fixed',
            'charge_value' => 400,
            'BC' => 'HQ',
        ]);

        // Net amount 4,000 (matches Tier 1): principal = 4,000 - 800 = 3,200. Doc charge = 2% of 3,200 = 64.00
        $calcTier1 = $this->postJson('/api/v1/hp/calculate', [
            'schema_type' => 'HP-DOC-TIERED',
            'net_amount' => 4000,
            'down_payment' => 800,
        ])->assertOk();

        $this->assertEquals(64, $calcTier1->json('data.document_charge'));
        $this->assertEquals('range', $calcTier1->json('data.document_charge_type'));
        $this->assertEquals(2, $calcTier1->json('data.document_charge_rate'));

        // Net amount 10,000 (matches Tier 2): Doc charge = fixed 400.00
        $calcTier2 = $this->postJson('/api/v1/hp/calculate', [
            'schema_type' => 'HP-DOC-TIERED',
            'net_amount' => 10000,
            'down_payment' => 2000,
        ])->assertOk();

        $this->assertEquals(400, $calcTier2->json('data.document_charge'));
        $this->assertEquals('range', $calcTier2->json('data.document_charge_type'));

        // Net amount 50,000 (outside configured tiers): returns 422
        $this->postJson('/api/v1/hp/calculate', [
            'schema_type' => 'HP-DOC-TIERED',
            'net_amount' => 50000,
            'down_payment' => 10000,
        ])->assertStatus(422)
            ->assertJsonValidationErrors('schema_type');
    }

    public function test_hp_agreement_creates_with_range_scheme(): void
    {
        $tiered = MSchema::create([
            'SchemaType' => 'HP-AGR-RANGE',
            'DownpaymentPrecentage' => 20,
            'InstallmentRate' => 10,
            'NoOfInstallment' => 4,
            'DocumentChargeType' => 'range',
            'IncludeDocumentCharge' => true,
            'PanaltyCharage' => 2.5,
            'GracePeriodDays' => 5,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        $tiered->documentChargeRanges()->create([
            'from_amount' => 100,
            'to_amount' => 15000,
            'charge_type' => 'fixed',
            'charge_value' => 500,
            'BC' => 'HQ',
        ]);

        // Agreement with selling price 10,000, downpayment 2,000 -> principal 8,000, interest 800, doc charge 500 financed.
        $res = $this->postJson('/api/v1/hp', [
            'invoice_date' => '2026-01-01',
            'customer_code' => $this->customer->Code,
            'guarantor_1_code' => $this->guarantor->Code,
            'schema_type' => 'HP-AGR-RANGE',
            'store_id' => $this->store->id,
            'down_payment' => 2000,
            'down_payment_method' => 'cash',
            'instalment_due_date' => 1,
            'items' => [
                ['item_code' => $this->item->item_code, 'qty' => 1],
            ],
        ])->assertCreated()
            ->assertJsonPath('data.document_charge_type', 'range')
            ->assertJsonPath('data.document_charge', '500.00');

        $this->assertDatabaseHas('t_hire_purchase_sums', [
            'id' => $res->json('data.id'),
            'document_charge_type' => 'range',
            'document_charge' => 500,
        ]);

        // Verify balanced double-entry GL ledger
        $this->assertEqualsWithDelta(
            (float) DB::table('t_account_trans')->sum('dr_amount'),
            (float) DB::table('t_account_trans')->sum('cr_amount'),
            0.001
        );
    }
}
