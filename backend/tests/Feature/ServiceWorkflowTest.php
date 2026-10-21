<?php

namespace Tests\Feature;

use App\Models\BankDetail;
use App\Models\Customer;
use App\Models\Item;
use App\Models\Role;
use App\Models\Supplier;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ServiceWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Customer $customer;
    private Item $item;
    private Supplier $serviceSupplier;
    private BankDetail $bank;

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
            'Code' => 'CUS-SRV-1',
            'name' => 'Service Customer',
            'NIC' => '902222222V',
            'phone' => '0772222222',
            'advance_balance' => 0,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);
        $this->item = Item::create([
            'item_code' => 'SRV-ITEM-1',
            'item_description' => 'Service Television',
            'is_batch' => false,
            'is_serialized' => true,
            'reorder_level' => 0,
            'standard_purchase_price' => 1000,
            'standard_sales_price' => 1500,
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);
        $this->serviceSupplier = Supplier::create([
            'Code' => 'SUP-SRV-1',
            'name' => 'Repair Partner',
            'phone' => '0112222222',
            'type' => 'service',
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);
        $this->bank = BankDetail::create([
            'bank_name' => 'ERP Operating Bank',
            'account_no' => '100-200',
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        Sanctum::actingAs($this->user);
    }

    public function test_complete_supplier_and_technician_service_lifecycle(): void
    {
        $ticket = $this->postJson('/api/v1/service-tickets', [
            'return_date' => '2026-06-14',
            'customer_code' => $this->customer->Code,
            'item_code' => $this->item->item_code,
            'item_serial_no' => 'SER-SRV-001',
            'problem_description' => 'No picture after power on.',
            'intake_condition' => 'Minor scratches on rear panel.',
            'is_warranty' => true,
            'expected_completion_date' => '2026-06-25',
        ])->assertCreated()
            ->assertJsonPath('data.status', 'received');

        $ticketId = $ticket->json('data.id');
        $ticketNo = $ticket->json('data.ticket_no');

        $this->postJson("/api/v1/service-tickets/{$ticketId}/dispatch", [
            'supplier_code' => $this->serviceSupplier->Code,
            'dispatch_date' => '2026-06-15',
            'estimated_return' => '2026-06-18',
            'supplier_reference' => 'EXT-001',
            'dispatch_notes' => 'Check display board.',
        ])->assertOk()
            ->assertJsonPath('data.status', 'dispatched_to_supplier');

        $received = $this->postJson("/api/v1/service-tickets/{$ticketId}/receive-back", [
            'received_date' => '2026-06-18',
            'supplier_report' => 'Display board repaired.',
            'repair_cost' => 100,
        ])->assertOk()
            ->assertJsonPath('data.status', 'received_from_supplier')
            ->assertJsonPath('data.dispatches.0.repair_cost', '100.00');

        $dispatchNo = $received->json('data.dispatches.0.dispatch_no');

        $this->postJson("/api/v1/service-tickets/{$ticketId}/assign-technician", [
            'issue_date' => '2026-06-18',
            'technician_name' => 'Nimal Perera',
            'diagnosis' => 'Verify supplier repair and complete testing.',
        ])->assertOk()
            ->assertJsonPath('data.status', 'under_repair');

        $this->postJson("/api/v1/service-tickets/{$ticketId}/complete-repair", [
            'completed_date' => '2026-06-19',
            'repair_details' => 'Display tested for four hours and firmware updated.',
            'parts_used' => 'HDMI connector',
            'labor_charge' => 50,
        ])->assertOk()
            ->assertJsonPath('data.status', 'repaired');

        $invoiced = $this->postJson("/api/v1/service-tickets/{$ticketId}/invoice", [
            'invoice_date' => '2026-06-19',
            'service_charge' => 200,
            'invoice_note' => 'Includes external repair cost.',
        ])->assertOk()
            ->assertJsonPath('data.status', 'invoiced')
            ->assertJsonPath('data.invoices.0.net_payable', '300.00');

        $invoiceNo = $invoiced->json('data.invoices.0.invoice_no');

        $this->postJson("/api/v1/service-tickets/{$ticketId}/customer-payment", [
            'payment_date' => '2026-06-20',
            'amount' => 300,
            'payment_method' => 'cash',
        ])->assertOk()
            ->assertJsonPath('data.status', 'customer_paid')
            ->assertJsonPath('data.invoices.0.payment_status', 'paid');

        $completed = $this->postJson("/api/v1/service-tickets/{$ticketId}/supplier-payment", [
            'payment_date' => '2026-06-20',
            'amount' => 100,
            'payment_method' => 'bank_transfer',
            'bank_detail_id' => $this->bank->id,
        ])->assertOk()
            ->assertJsonPath('data.status', 'completed')
            ->assertJsonPath('data.dispatches.0.payment_status', 'paid');

        $this->assertDatabaseHas('t_service_returns', [
            'ticket_no' => $ticketNo,
            'status' => 'completed',
            'completed_date' => '2026-06-20',
        ]);
        $this->assertDatabaseHas('t_service_invoices', [
            'invoice_no' => $invoiceNo,
            'net_payable' => 300,
            'paid_amount' => 300,
            'payment_status' => 'paid',
        ]);
        $this->assertDatabaseHas('t_service_dispatches', [
            'dispatch_no' => $dispatchNo,
            'repair_cost' => 100,
            'paid_amount' => 100,
            'payment_status' => 'paid',
        ]);
        $this->assertCount(9, $completed->json('data.tracks'));

        $debit = (float) \DB::table('t_account_trans')->sum('dr_amount');
        $credit = (float) \DB::table('t_account_trans')->sum('cr_amount');
        $this->assertSame($debit, $credit);

        $this->getJson('/api/v1/service-tickets/summary')
            ->assertOk()
            ->assertJsonPath('data.open_tickets', 0)
            ->assertJsonPath('data.completed_tickets', 1)
            ->assertJsonPath('data.customer_outstanding', 0)
            ->assertJsonPath('data.supplier_outstanding', 0);
    }

    public function test_internal_repair_completes_without_supplier_dispatch(): void
    {
        $ticket = $this->postJson('/api/v1/service-tickets', [
            'return_date' => '2026-06-14',
            'customer_code' => $this->customer->Code,
            'item_code' => $this->item->item_code,
            'item_serial_no' => 'SER-SRV-002',
            'problem_description' => 'Remote control not pairing.',
        ])->assertCreated();

        $ticketId = $ticket->json('data.id');

        $this->postJson("/api/v1/service-tickets/{$ticketId}/assign-technician", [
            'issue_date' => '2026-06-14',
            'technician_name' => 'Internal Technician',
        ])->assertOk();

        $this->postJson("/api/v1/service-tickets/{$ticketId}/complete-repair", [
            'completed_date' => '2026-06-14',
            'repair_details' => 'Repaired receiver and paired remote.',
        ])->assertOk();

        $this->postJson("/api/v1/service-tickets/{$ticketId}/invoice", [
            'invoice_date' => '2026-06-14',
            'service_charge' => 150,
        ])->assertOk()
            ->assertJsonPath('data.invoices.0.supplier_repair_cost', '0.00');

        $this->postJson("/api/v1/service-tickets/{$ticketId}/customer-payment", [
            'payment_date' => '2026-06-14',
            'amount' => 150,
            'payment_method' => 'cash',
        ])->assertOk()
            ->assertJsonPath('data.status', 'completed');
    }

    public function test_received_ticket_can_be_edited_deleted_and_invalid_supplier_is_rejected(): void
    {
        $normalSupplier = Supplier::create([
            'Code' => 'SUP-NORMAL',
            'name' => 'Normal Supplier',
            'type' => 'normal',
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);

        $ticket = $this->postJson('/api/v1/service-tickets', [
            'return_date' => '2026-06-14',
            'customer_code' => $this->customer->Code,
            'item_code' => $this->item->item_code,
            'item_serial_no' => 'SER-SRV-003',
            'problem_description' => 'Intermittent sound.',
        ])->assertCreated();
        $ticketId = $ticket->json('data.id');

        $this->putJson("/api/v1/service-tickets/{$ticketId}", [
            'problem_description' => 'Intermittent sound from left speaker.',
            'intake_condition' => 'Good condition.',
        ])->assertOk()
            ->assertJsonPath('data.problem_description', 'Intermittent sound from left speaker.');

        $this->postJson("/api/v1/service-tickets/{$ticketId}/dispatch", [
            'supplier_code' => $normalSupplier->Code,
            'dispatch_date' => '2026-06-15',
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('supplier_code');

        $this->deleteJson("/api/v1/service-tickets/{$ticketId}")
            ->assertOk();
        $this->assertDatabaseMissing('t_service_returns', ['id' => $ticketId]);
    }
}
