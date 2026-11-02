<?php

namespace App\Services;

use App\Models\BankDetail;
use App\Models\MChartofAccount;
use App\Models\MMainAccountType;
use App\Models\MMainCategory;
use App\Models\TAccountTran;
use App\Models\TBankEntry;
use App\Models\TExpense;
use App\Models\TPaymentVoucher;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class FinancialService
{
    public function __construct(private readonly AccountingService $accountingService)
    {
    }

    public function createAccount(array $data, User $user): MChartofAccount
    {
        return MChartofAccount::create([
            'code' => $data['code'],
            'description' => $data['description'],
            'type_id' => $data['type_id'],
            'is_active' => $data['is_active'] ?? true,
            'opening_balance' => $data['opening_balance'] ?? 0,
            'BC' => $user->BC,
            'UID' => $user->username,
        ])->load('type.category');
    }

    public function updateAccount(MChartofAccount $account, array $data, User $user): MChartofAccount
    {
        $account->fill([
            'description' => $data['description'],
            'type_id' => $data['type_id'],
            'is_active' => $data['is_active'] ?? true,
            'opening_balance' => $data['opening_balance'] ?? 0,
            'UID' => $user->username,
        ])->save();

        return $account->load('type.category');
    }

    public function deleteAccount(MChartofAccount $account): void
    {
        if ($account->transactions()->exists()) {
            throw ValidationException::withMessages([
                'account' => 'Accounts with ledger transactions cannot be deleted. Deactivate the account instead.',
            ]);
        }
        if (in_array($account->code, $this->systemAccountCodes(), true)) {
            throw ValidationException::withMessages(['account' => 'System accounts cannot be deleted.']);
        }
        $account->delete();
    }

    public function createVoucher(array $data, User $user): TPaymentVoucher
    {
        $debit = $this->findAccount($data['debit_account_code'], $user, true);
        $creditCode = $this->paymentAccount($data['payment_method']);
        $this->findAccount($creditCode, $user, true);
        $this->validateBankMethod($data['payment_method'], $data['bank_detail_id'] ?? null, $user);

        return TPaymentVoucher::create([
            'invoice_no' => $this->nextNumber('PV', $user->BC, TPaymentVoucher::class, 'invoice_no'),
            'date' => $data['date'],
            'cramount' => $data['amount'],
            'crcode' => $creditCode,
            'dramount' => $data['amount'],
            'drcode' => $debit->code,
            'description' => $data['description'] ?? null,
            'amount' => $data['amount'],
            'status' => 'draft',
            'payment_method' => $data['payment_method'],
            'bank_detail_id' => $data['bank_detail_id'] ?? null,
            'BC' => $user->BC,
            'UID' => $user->username,
        ])->load(['debitAccount.type.category', 'creditAccount.type.category', 'bankAccount']);
    }

    public function postVoucher(TPaymentVoucher $voucher, User $user): TPaymentVoucher
    {
        return DB::transaction(function () use ($voucher, $user) {
            $voucher = TPaymentVoucher::query()
                ->whereKey($voucher->id)
                ->where('BC', $user->BC)
                ->lockForUpdate()
                ->firstOrFail();
            if ($voucher->status !== 'draft') {
                throw ValidationException::withMessages(['voucher' => 'Only draft vouchers can be posted.']);
            }
            $this->accountingService->postBalanced(
                'PAYMENT_VOUCHER',
                $voucher->invoice_no,
                $voucher->date->format('Y-m-d'),
                $voucher->drcode,
                $voucher->crcode,
                (float) $voucher->amount,
                $user
            );
            $voucher->update([
                'status' => 'posted',
                'approved_by' => $user->id,
                'approved_at' => now(),
                'UID' => $user->username,
            ]);
            return $voucher->fresh()->load(['debitAccount.type.category', 'creditAccount.type.category', 'bankAccount']);
        });
    }

    public function cancelVoucher(TPaymentVoucher $voucher, string $reason, User $user): TPaymentVoucher
    {
        if ($voucher->status !== 'draft') {
            throw ValidationException::withMessages([
                'voucher' => 'Posted vouchers cannot be cancelled. Use a reversing voucher.',
            ]);
        }
        $voucher->update([
            'status' => 'cancelled',
            'cancellation_reason' => $reason,
            'UID' => $user->username,
        ]);
        return $voucher->fresh()->load(['debitAccount', 'creditAccount', 'bankAccount']);
    }

    public function createExpense(array $data, User $user): TExpense
    {
        return DB::transaction(function () use ($data, $user) {
            $account = $this->findAccount($data['expense_account_code'], $user, true);
            $creditCode = $this->paymentAccount($data['payment_method']);
            $this->validateBankMethod($data['payment_method'], $data['bank_detail_id'] ?? null, $user);
            $expenseNo = $this->nextNumber('EXP', $user->BC, TExpense::class, 'Expense_no');

            $expense = TExpense::create([
                'Expense_no' => $expenseNo,
                'Expense_date' => $data['expense_date'],
                'ExpenseType' => $account->description,
                'expense_account_code' => $account->code,
                'Expense_note' => $data['note'] ?? null,
                'Expense_Amount' => $data['amount'],
                'payment_method' => $data['payment_method'],
                'bank_detail_id' => $data['bank_detail_id'] ?? null,
                'status' => 'posted',
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $this->accountingService->postBalanced(
                'EXPENSE',
                $expenseNo,
                $data['expense_date'],
                $account->code,
                $creditCode,
                (float) $data['amount'],
                $user
            );

            return $expense->load(['account.type.category', 'bankAccount']);
        });
    }

    public function createBankEntry(array $data, User $user): TBankEntry
    {
        return DB::transaction(function () use ($data, $user) {
            $bank = BankDetail::query()
                ->whereKey($data['bank_detail_id'])
                ->where('BC', $user->BC)
                ->firstOrFail();
            $offset = $this->findAccount($data['offset_account_code'], $user, true);
            $amount = round((float) $data['amount'], 2);
            $charges = round((float) ($data['bank_charges'] ?? 0), 2);
            $entryNo = $this->nextNumber('BNK', $user->BC, TBankEntry::class, 'invoice_no');
            $isDeposit = $data['entry_type'] === 'deposit';

            if ($isDeposit && $charges > $amount) {
                throw ValidationException::withMessages(['bank_charges' => 'Bank charges cannot exceed a deposit.']);
            }

            $entry = TBankEntry::create([
                'invoice_no' => $entryNo,
                'bank_detail_id' => $bank->id,
                'entry_type' => $data['entry_type'],
                'date' => $data['date'],
                'cramount' => $isDeposit ? $amount : $amount + $charges,
                'crcode' => $isDeposit ? $offset->code : AccountingService::BANK,
                'dramount' => $isDeposit ? $amount - $charges : $amount,
                'drcode' => $isDeposit ? AccountingService::BANK : $offset->code,
                'description' => $data['description'] ?? null,
                'amount' => $amount,
                'bank_charges' => $charges,
                'status' => 'posted',
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $lines = $isDeposit
                ? [
                    ['account' => AccountingService::BANK, 'debit' => $amount - $charges],
                    ['account' => AccountingService::BANK_CHARGES, 'debit' => $charges],
                    ['account' => $offset->code, 'credit' => $amount],
                ]
                : [
                    ['account' => $offset->code, 'debit' => $amount],
                    ['account' => AccountingService::BANK_CHARGES, 'debit' => $charges],
                    ['account' => AccountingService::BANK, 'credit' => $amount + $charges],
                ];
            $this->accountingService->postJournal('BANK_ENTRY', $entryNo, $data['date'], $lines, $user);

            return $entry->load(['bankAccount', 'debitAccount', 'creditAccount']);
        });
    }

    public function summary(User $user): array
    {
        $balances = TAccountTran::query()
            ->where('BC', $user->BC)
            ->selectRaw('AccCode, SUM(dr_amount) - SUM(cr_amount) as balance')
            ->groupBy('AccCode')
            ->pluck('balance', 'AccCode');
        $debits = (float) TAccountTran::query()->where('BC', $user->BC)->sum('dr_amount');
        $credits = (float) TAccountTran::query()->where('BC', $user->BC)->sum('cr_amount');

        return [
            'cash_balance' => round((float) ($balances[AccountingService::CASH] ?? 0), 2),
            'bank_balance' => round((float) ($balances[AccountingService::BANK] ?? 0), 2),
            'receivables' => round(
                (float) ($balances[AccountingService::ACCOUNTS_RECEIVABLE] ?? 0)
                + (float) ($balances[AccountingService::HP_RECEIVABLE] ?? 0),
                2
            ),
            'payables' => round(abs((float) ($balances[AccountingService::ACCOUNTS_PAYABLE] ?? 0)), 2),
            'total_debits' => round($debits, 2),
            'total_credits' => round($credits, 2),
            'trial_balance_difference' => round($debits - $credits, 2),
            'draft_vouchers' => TPaymentVoucher::query()->where('BC', $user->BC)->where('status', 'draft')->count(),
        ];
    }

    public function options(User $user): array
    {
        $this->accountingService->ensureSystemAccounts($user);
        return [
            'categories' => MMainCategory::query()->with('types')->orderBy('name')->get(),
            'account_types' => MMainAccountType::query()->with('category')->orderBy('name')->get(),
            'accounts' => MChartofAccount::query()
                ->where('BC', $user->BC)
                ->with('type.category')
                ->orderBy('code')
                ->get(),
            'bank_accounts' => BankDetail::query()->where('BC', $user->BC)->orderBy('bank_name')->get(),
        ];
    }

    private function findAccount(string $code, User $user, bool $active = false): MChartofAccount
    {
        return MChartofAccount::query()
            ->where('code', $code)
            ->where('BC', $user->BC)
            ->when($active, fn ($query) => $query->where('is_active', true))
            ->firstOrFail();
    }

    private function validateBankMethod(string $method, ?int $bankId, User $user): void
    {
        if ($method === 'bank' && ! BankDetail::query()->whereKey($bankId)->where('BC', $user->BC)->exists()) {
            throw ValidationException::withMessages(['bank_detail_id' => 'Select a valid bank account.']);
        }
    }

    private function paymentAccount(string $method): string
    {
        return $method === 'bank' ? AccountingService::BANK : AccountingService::CASH;
    }

    private function systemAccountCodes(): array
    {
        return [
            AccountingService::CASH,
            AccountingService::BANK,
            AccountingService::ACCOUNTS_RECEIVABLE,
            AccountingService::CHEQUES_IN_HAND,
            AccountingService::INVENTORY,
            AccountingService::HP_RECEIVABLE,
            AccountingService::ACCOUNTS_PAYABLE,
            AccountingService::CHEQUES_PAYABLE,
            AccountingService::SERVICE_INCOME,
            AccountingService::SALES_INCOME,
            AccountingService::HP_INTEREST_INCOME,
            AccountingService::DOCUMENT_CHARGE_INCOME,
            AccountingService::TRANSPORT_INCOME,
            AccountingService::PENALTY_INCOME,
            AccountingService::SERVICE_EXPENSE,
            AccountingService::GENERAL_EXPENSE,
            AccountingService::BANK_CHARGES,
            AccountingService::SALES_DISCOUNT,
        ];
    }

    private function nextNumber(string $prefix, string $branch, string $model, string $column): string
    {
        $count = $model::query()->where('BC', $branch)->whereDate('created_at', today())->count() + 1;
        return "{$prefix}-{$branch}-".now()->format('Ymd').'-'.str_pad($count, 4, '0', STR_PAD_LEFT);
    }
}
