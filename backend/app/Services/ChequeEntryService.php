<?php

namespace App\Services;

use App\Models\BankBranch;
use App\Models\BankDetail;
use App\Models\ChequeStatusHistory;
use App\Models\TCusCheque;
use App\Models\TSupCheque;
use App\Models\User;
use Illuminate\Validation\ValidationException;

class ChequeEntryService
{
    public function __construct(private readonly AccountingService $accountingService)
    {
    }

    public function options(string $branchCode)
    {
        return BankDetail::query()
            ->where('BC', $branchCode)
            ->with(['branches' => fn ($query) => $query
                ->where('BC', $branchCode)
                ->orderBy('branch_name')])
            ->orderBy('bank_name')
            ->get(['id', 'bank_name', 'account_no', 'BC']);
    }

    public function createCustomer(
        string $transactionNumber,
        string $transactionType,
        string $transactionDate,
        float $amount,
        array $data,
        User $user,
        string $creditAccount = AccountingService::ACCOUNTS_RECEIVABLE,
        bool $postAccounting = true
    ): TCusCheque {
        [$bank, $branch] = $this->resolveSource($data, $user);
        $this->requireFields($data, ['cheque_no', 'account_no', 'due_date']);

        $cheque = TCusCheque::create([
            'trans_no' => $transactionNumber,
            'trans_type' => $transactionType,
            'source_bank_detail_id' => $bank->id,
            'source_bank_branch_id' => $branch->id,
            'bank' => $bank->bank_name,
            'branch_code' => $branch->branch_code,
            'cheques_no' => $data['cheque_no'],
            'acc_no' => $data['account_no'],
            'due_date' => $data['due_date'],
            'amount' => $amount,
            'status' => 'pending',
            'BC' => $user->BC,
            'UID' => $user->username,
        ]);

        $this->recordHistory('customer', $cheque->id, $transactionDate, $transactionType, $user);

        if ($postAccounting) {
            $this->accountingService->postBalanced(
                'CUSTOMER_CHEQUE_RECEIPT',
                "CUS-CHQ-{$cheque->id}-RECEIPT",
                $transactionDate,
                AccountingService::CHEQUES_IN_HAND,
                $creditAccount,
                $amount,
                $user
            );
        }

        return $cheque;
    }

    public function createSupplier(
        string $transactionNumber,
        string $transactionType,
        string $transactionDate,
        float $amount,
        array $data,
        User $user
    ): TSupCheque {
        [$bank, $branch] = $this->resolveSource($data, $user);
        $this->requireFields($data, ['cheque_no', 'account_no', 'release_date']);

        $cheque = TSupCheque::create([
            'trans_no' => $transactionNumber,
            'trans_type' => $transactionType,
            'source_bank_detail_id' => $bank->id,
            'source_bank_branch_id' => $branch->id,
            'bank' => $bank->bank_name,
            'branch_code' => $branch->branch_code,
            'cheques_no' => $data['cheque_no'],
            'acc_no' => $data['account_no'],
            'release_date' => $data['release_date'],
            'amount' => $amount,
            'status' => 'pending',
            'BC' => $user->BC,
            'UID' => $user->username,
        ]);

        $this->recordHistory('supplier', $cheque->id, $transactionDate, $transactionType, $user);
        $this->accountingService->postBalanced(
            'SUPPLIER_CHEQUE_ISSUE',
            "SUP-CHQ-{$cheque->id}-ISSUE",
            $transactionDate,
            AccountingService::ACCOUNTS_PAYABLE,
            AccountingService::CHEQUES_PAYABLE,
            $amount,
            $user
        );

        return $cheque;
    }

    public function validateSource(array $data, User $user): void
    {
        $this->resolveSource($data, $user);
    }

    private function resolveSource(array $data, User $user): array
    {
        $this->requireFields($data, ['bank_id', 'bank_branch_id']);

        $bank = BankDetail::query()
            ->whereKey($data['bank_id'])
            ->where('BC', $user->BC)
            ->first();
        $branch = BankBranch::query()
            ->whereKey($data['bank_branch_id'])
            ->where('bank_id', $data['bank_id'])
            ->where('BC', $user->BC)
            ->first();

        if (! $bank) {
            throw ValidationException::withMessages([
                'cheque.bank_id' => 'Select a valid bank from the bank master.',
            ]);
        }
        if (! $branch) {
            throw ValidationException::withMessages([
                'cheque.bank_branch_id' => 'Select a valid branch for the selected bank.',
            ]);
        }

        return [$bank, $branch];
    }

    private function requireFields(array $data, array $fields): void
    {
        foreach ($fields as $field) {
            if (blank($data[$field] ?? null)) {
                throw ValidationException::withMessages([
                    "cheque.{$field}" => 'This cheque field is required.',
                ]);
            }
        }
    }

    private function recordHistory(
        string $type,
        int $chequeId,
        string $date,
        string $transactionType,
        User $user
    ): void {
        ChequeStatusHistory::create([
            'cheque_type' => $type,
            'cheque_id' => $chequeId,
            'from_status' => null,
            'to_status' => 'pending',
            'action_date' => $date,
            'reason' => "{$transactionType} cheque recorded from bank master.",
            'BC' => $user->BC,
            'UID' => $user->username,
        ]);
    }
}
