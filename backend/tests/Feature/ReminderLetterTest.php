<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Item;
use App\Models\MGuarantor;
use App\Models\MSchema;
use App\Models\Role;
use App\Models\Store;
use App\Models\TInstalment;
use App\Models\User;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Testing\TestResponse;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReminderLetterTest extends TestCase
{
    use RefreshDatabase;

    private Role $role;
    private string $invoiceNo;
    private Carbon $firstDue;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo(Carbon::parse('2026-01-01'));

        $this->role = Role::create(['name' => Role::SUPER_ADMIN, 'description' => 'Administrator']);
        $user = User::create([
            'username' => 'admin',
            'email' => 'admin@example.com',
            'password' => 'password',
            'role_id' => $this->role->id,
            'BC' => 'HQ',
        ]);
        $customer = Customer::create([
            'Code' => 'CUS-RL-1', 'name' => 'Letter Customer', 'NIC' => '901111111V',
            'phone' => '0771111111', 'address' => 'Kandy', 'advance_balance' => 0, 'BC' => 'HQ', 'UID' => 'admin',
        ]);
        $guarantor = MGuarantor::create([
            'Code' => 'GUA-RL-1', 'name' => 'Letter Guarantor', 'NIC' => '882222222V',
            'phone' => '0772222222', 'address' => 'Galle', 'BC' => 'HQ', 'UID' => 'admin',
        ]);
        MSchema::create([
            'SchemaType' => 'HP-4', 'DownpaymentPrecentage' => 20, 'InstallmentRate' => 10, 'NoOfInstallment' => 4,
            'DocumentCharagePrecentage' => 2, 'PanaltyCharage' => 2.5, 'GracePeriodDays' => 5, 'BC' => 'HQ', 'UID' => 'admin',
        ]);
        $store = Store::create(['name' => 'Main Store', 'location' => 'HQ', 'BC' => 'HQ', 'UID' => 'admin']);
        $item = Item::create([
            'item_code' => 'RL-TV-1', 'item_description' => 'Reminder Television', 'is_batch' => false,
            'is_serialized' => false, 'reorder_level' => 0, 'standard_purchase_price' => 70000,
            'standard_sales_price' => 100000, 'BC' => 'HQ', 'UID' => 'admin',
        ]);
        app(StockService::class)->receiveStock('OPEN-RL', 'OPENING', $item->item_code, null, $store->id, 1, 70000, 100000, 'HQ', 'admin');
        Sanctum::actingAs($user);

        $agreement = $this->postJson('/api/v1/hp', [
            'invoice_date' => '2026-01-01',
            'customer_code' => $customer->Code,
            'guarantor_1_code' => $guarantor->Code,
            'schema_type' => 'HP-4',
            'store_id' => $store->id,
            'down_payment' => 20000,
            'down_payment_method' => 'cash',
            'instalment_due_date' => 1,
            'items' => [['item_code' => $item->item_code, 'qty' => 1]],
        ])->assertCreated();

        $this->invoiceNo = $agreement->json('data.invoice_no');
        $this->firstDue = TInstalment::query()->where('invoice_no', $this->invoiceNo)->orderBy('instalment_date')->first()->instalment_date->copy()->startOfDay();
    }

    public function test_letters_escalate_through_stages_to_seizure(): void
    {
        $this->travelTo($this->firstDue->copy()->addDays(10));
        $this->row()
            ->assertJsonPath('data.rows.0.status', 'waiting')
            ->assertJsonPath('data.rows.0.next_stage', 1)
            ->assertJsonPath('data.rows.0.next_print_date', $this->firstDue->copy()->addDays(30)->toDateString());

        $this->travelTo($this->firstDue->copy()->addDays(30));
        $this->row()->assertJsonPath('data.rows.0.status', 'due')->assertJsonPath('data.rows.0.next_stage', 1);

        $letters = $this->postJson('/api/v1/reminder-letters/render', ['invoice_nos' => [$this->invoiceNo], 'stage' => 1])
            ->assertOk()
            ->assertJsonCount(2, 'data.letters')
            ->assertJsonPath('data.letters.0.recipient_type', 'customer')
            ->assertJsonPath('data.letters.1.recipient_name', 'Letter Guarantor');
        $this->assertStringContainsString('Letter Guarantor', $letters->json('data.letters.1.body'));
        $this->assertStringNotContainsString('{arrears_amount}', $letters->json('data.letters.0.body'));

        foreach ([1, 2, 3] as $stage) {
            $this->postJson('/api/v1/reminder-letters/mark-printed', ['invoice_nos' => [$this->invoiceNo], 'stage' => $stage])
                ->assertOk()
                ->assertJsonPath('data.advanced', 1);
            $this->row()->assertJsonPath('data.rows.0.last_stage', $stage)->assertJsonPath('data.rows.0.status', 'waiting');
            $this->travel(30)->days();
        }

        $this->row()->assertJsonPath('data.rows.0.status', 'seizure_ready')->assertJsonPath('data.rows.0.next_stage', 4);

        $this->postJson('/api/v1/reminder-letters/mark-printed', ['invoice_nos' => [$this->invoiceNo], 'stage' => 4])
            ->assertOk();
        $this->row()->assertJsonPath('data.rows.0.status', 'seizure_issued')->assertJsonPath('data.rows.0.next_stage', null);

        $this->assertDatabaseCount('reminder_letter_logs', 8);
        $this->assertDatabaseHas('hp_status_histories', ['invoice_no' => $this->invoiceNo, 'event' => 'seizing_order']);
    }

    public function test_stage_cannot_be_skipped_and_reprint_does_not_advance(): void
    {
        $this->travelTo($this->firstDue->copy()->addDays(30));

        $this->postJson('/api/v1/reminder-letters/mark-printed', ['invoice_nos' => [$this->invoiceNo], 'stage' => 2])
            ->assertOk()
            ->assertJsonPath('data.advanced', 0)
            ->assertJsonPath('data.skipped.0', $this->invoiceNo);

        $this->postJson('/api/v1/reminder-letters/mark-printed', ['invoice_nos' => [$this->invoiceNo], 'stage' => 1])->assertOk();
        $this->postJson('/api/v1/reminder-letters/mark-printed', ['invoice_nos' => [$this->invoiceNo], 'stage' => 1])
            ->assertOk()
            ->assertJsonPath('data.advanced', 0);

        $this->row()->assertJsonPath('data.rows.0.last_stage', 1);
    }

    public function test_admin_can_override_next_print_date(): void
    {
        $this->travelTo($this->firstDue->copy()->addDays(5));
        $this->row()->assertJsonPath('data.rows.0.status', 'waiting');

        $this->putJson('/api/v1/reminder-letters/next-date', [
            'invoice_no' => $this->invoiceNo,
            'next_print_date' => now()->toDateString(),
            'note' => 'Customer unreachable',
        ])->assertOk();
        $this->row()
            ->assertJsonPath('data.rows.0.status', 'due')
            ->assertJsonPath('data.rows.0.is_overridden', true)
            ->assertJsonPath('data.rows.0.override_note', 'Customer unreachable');

        $this->deleteJson('/api/v1/reminder-letters/next-date', ['invoice_no' => $this->invoiceNo])->assertOk();
        $this->row()->assertJsonPath('data.rows.0.status', 'waiting')->assertJsonPath('data.rows.0.is_overridden', false);
    }

    public function test_settling_arrears_resets_tracker_and_other_branches_are_hidden(): void
    {
        $this->travelTo($this->firstDue->copy()->addDays(30));
        $this->postJson('/api/v1/reminder-letters/mark-printed', ['invoice_nos' => [$this->invoiceNo], 'stage' => 1])->assertOk();

        $other = User::create([
            'username' => 'branch2', 'email' => 'b2@example.com', 'password' => 'password',
            'role_id' => $this->role->id, 'BC' => 'BR2',
        ]);
        Sanctum::actingAs($other);
        $this->getJson('/api/v1/reminder-letters')->assertOk()->assertJsonCount(0, 'data.rows');

        Sanctum::actingAs(User::where('username', 'admin')->first());
        TInstalment::query()
            ->where('invoice_no', $this->invoiceNo)
            ->whereDate('instalment_date', '<', now()->toDateString())
            ->update(['status' => 'paid', 'balance_amount' => 0]);

        $this->getJson('/api/v1/reminder-letters')->assertOk()->assertJsonCount(0, 'data.rows');
        $this->assertDatabaseHas('reminder_letter_trackers', ['invoice_no' => $this->invoiceNo, 'last_stage' => 0]);
    }

    public function test_templates_and_settings_are_editable(): void
    {
        $this->putJson('/api/v1/reminder-letters/settings', [
            'letter1_after_days' => 10, 'letter2_after_days' => 20, 'letter3_after_days' => 30,
            'seizure_after_days' => 40, 'settle_within_days' => 7,
        ])->assertOk();

        $this->putJson('/api/v1/reminder-letters/templates/1', [
            'title' => 'Custom', 'body' => 'Hello {recipient_name}, pay Rs. {arrears_amount}',
        ])->assertOk();

        $this->travelTo($this->firstDue->copy()->addDays(10));
        $arrears = $this->row()->assertJsonPath('data.rows.0.status', 'due')->json('data.rows.0.arrears_amount');

        $this->postJson('/api/v1/reminder-letters/render', ['invoice_nos' => [$this->invoiceNo], 'stage' => 1])
            ->assertOk()
            ->assertJsonPath('data.letters.0.body', 'Hello Letter Customer, pay Rs. '.number_format($arrears, 2));
    }

    public function test_company_logo_and_contact_details_reach_the_letters(): void
    {
        $logo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

        $this->postJson('/api/v1/companies', ['name' => 'Acme Finance', 'logo' => 'not-an-image'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('logo');

        $this->postJson('/api/v1/companies', [
            'name' => 'Acme Finance', 'address' => 'Main Street, Kandy', 'phone' => '0812345678',
            'email' => 'info@acme.lk', 'logo' => $logo,
        ])->assertCreated();

        $this->travelTo($this->firstDue->copy()->addDays(30));
        $this->postJson('/api/v1/reminder-letters/render', ['invoice_nos' => [$this->invoiceNo], 'stage' => 1])
            ->assertOk()
            ->assertJsonPath('data.company.logo', $logo)
            ->assertJsonPath('data.company.email', 'info@acme.lk')
            ->assertJsonPath('data.company.address', 'Main Street, Kandy');
    }

    private function row(): TestResponse
    {
        return $this->getJson('/api/v1/reminder-letters')->assertOk()->assertJsonCount(1, 'data.rows');
    }
}
