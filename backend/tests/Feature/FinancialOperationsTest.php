<?php

namespace Tests\Feature;

use App\Models\BankDetail;
use App\Models\MMainAccountType;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FinancialOperationsTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private BankDetail $bank;

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
        $this->bank = BankDetail::create([
            'bank_name' => 'Operating Bank',
            'account_no' => '001-001',
            'BC' => 'HQ',
            'UID' => 'admin',
        ]);
        Sanctum::actingAs($this->user);
        $this->getJson('/api/v1/finance/options')->assertOk();
    }

    public function test_chart_voucher_expense_and_bank_entries_post_balanced_ledgers(): void
    {
        $expenseType = MMainAccountType::query()->where('name', 'Operating Expenses')->firstOrFail();
        $account = $this->postJson('/api/v1/accounts', [
            'code' => '5100',
            'description' => 'Office Rent',
            'type_id' => $expenseType->id,
            'opening_balance' => 0,
        ])->assertCreated()
            ->assertJsonPath('data.code', '5100');

        $voucher = $this->postJson('/api/v1/vouchers', [
            'date' => '2026-06-14',
            'debit_account_code' => '5100',
            'amount' => 1000,
            'payment_method' => 'cash',
            'description' => 'Monthly office rent',
        ])->assertCreated()
            ->assertJsonPath('data.status', 'draft');

        $this->postJson('/api/v1/vouchers/'.$voucher->json('data.id').'/post')
            ->assertOk()
            ->assertJsonPath('data.status', 'posted');

        $this->postJson('/api/v1/expenses', [
            'expense_date' => '2026-06-14',
            'expense_account_code' => '5100',
            'amount' => 250,
            'payment_method' => 'bank',
            'bank_detail_id' => $this->bank->id,
            'note' => 'Utility charge',
        ])->assertCreated()
            ->assertJsonPath('data.status', 'posted');

        $this->postJson('/api/v1/bank-entries', [
            'date' => '2026-06-14',
            'bank_detail_id' => $this->bank->id,
            'entry_type' => 'deposit',
            'offset_account_code' => '1001',
            'amount' => 5000,
            'bank_charges' => 50,
            'description' => 'Cash deposit',
        ])->assertCreated()
            ->assertJsonPath('data.entry_type', 'deposit');

        $summary = $this->getJson('/api/v1/finance/summary')->assertOk();
        $this->assertSame(0.0, (float) $summary->json('data.trial_balance_difference'));
        $this->assertSame(
            (float) \DB::table('t_account_trans')->sum('dr_amount'),
            (float) \DB::table('t_account_trans')->sum('cr_amount')
        );

        $this->deleteJson('/api/v1/accounts/'.$account->json('data.id'))
            ->assertUnprocessable();
    }

    public function test_draft_voucher_can_be_cancelled_without_ledger_posting(): void
    {
        $expenseType = MMainAccountType::query()->where('name', 'Operating Expenses')->firstOrFail();
        $this->postJson('/api/v1/accounts', [
            'code' => '5200',
            'description' => 'Cleaning',
            'type_id' => $expenseType->id,
        ])->assertCreated();

        $voucher = $this->postJson('/api/v1/vouchers', [
            'date' => '2026-06-14',
            'debit_account_code' => '5200',
            'amount' => 100,
            'payment_method' => 'cash',
        ])->assertCreated();

        $this->postJson('/api/v1/vouchers/'.$voucher->json('data.id').'/cancel', [
            'reason' => 'Created in error.',
        ])->assertOk()
            ->assertJsonPath('data.status', 'cancelled');

        $this->assertDatabaseCount('t_account_trans', 0);
    }
}
