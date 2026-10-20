<?php

namespace App\Services;

use App\Models\BankDetail;
use App\Models\ChequeStatusHistory;
use App\Models\Customer;
use App\Models\TAdvancCusPayment;
use App\Models\TBankEntry;
use App\Models\TCusCheque;
use App\Models\TCustomerAccountTrance;
use App\Models\TCustomerAdvanceAllocation;
use App\Models\TCustomerHpAdvanceAllocation;
use App\Models\TCustomerInvoicePayment;
use App\Models\TCustomerPayment;
use App\Models\THirePurchaseDetail;
use App\Models\THirePurchaseSum;
use App\Models\THirePurchaseToSale;
use App\Models\THpInstallmentPayment;
use App\Models\TInvoiceSum;
use App\Models\TInstalment;
use App\Models\TPurchasesSum;
use App\Models\TSupCheque;
use App\Models\TSupPurchaseTrance;
use App\Models\TSupplierInvoicePayment;
use App\Models\TSupplierPayment;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ChequeService
{
    public function __construct(private readonly AccountingService $accountingService)
    {
    }

    public function customerCheques(array $filters, string $branchCode)
    {
        return $this->applyFilters(
            TCusCheque::query()
                ->where('BC', $branchCode)
                ->with(['sourceBank', 'sourceBranch', 'bankAccount', 'history.bankAccount']),
            $filters,
            'due_date'
        )->orderByRaw("CASE status WHEN 'pending' THEN 1 WHEN 'returned' THEN 2 ELSE 3 END")
            ->orderBy('due_date')
            ->orderByDesc('id')
            ->paginate($filters['per_page'] ?? 25);
    }

    public function supplierCheques(array $filters, string $branchCode)
    {
        return $this->applyFilters(
            TSupCheque::query()
                ->where('BC', $branchCode)
                ->with(['sourceBank', 'sourceBranch', 'bankAccount', 'history.bankAccount']),
            $filters,
            'release_date'
        )->orderByRaw("CASE status WHEN 'pending' THEN 1 WHEN 'returned' THEN 2 ELSE 3 END")
            ->orderBy('release_date')
            ->orderByDesc('id')
            ->paginate($filters['per_page'] ?? 25);
    }

    public function summary(string $branchCode): array
    {
        $customer = $this->statusSummary(TCusCheque::query()->where('BC', $branchCode));
        $supplier = $this->statusSummary(TSupCheque::query()->where('BC', $branchCode));

        return [
            'customer' => $customer,
            'supplier' => $supplier,
            'net_bank_impact' => round(
                $customer['passed_amount'] - $supplier['passed_amount'],
                2
            ),
            'bank_accounts' => BankDetail::query()
                ->where('BC', $branchCode)
                ->orderBy('bank_name')
                ->orderBy('account_no')
                ->get(['id', 'bank_name', 'account_no']),
        ];
    }

    public function passCustomerCheque(
        int $chequeId,
        string $date,
        int $bankDetailId,
        User $user
    ): TCusCheque {
        return DB::transaction(function () use ($chequeId, $date, $bankDetailId, $user) {
            $cheque = $this->lockCustomerCheque($chequeId, $user);
            $bank = $this->findBankAccount($bankDetailId, $user->BC);
            $this->assertPending($cheque->status);

            $this->accountingService->postBalanced(
                'CUSTOMER_CHEQUE_PASS',
                "CUS-CHQ-{$cheque->id}-PASS",
                $date,
                AccountingService::BANK,
                AccountingService::CHEQUES_IN_HAND,
                (float) $cheque->amount,
                $user
            );
            $this->recordBankEntry(
                "CUS-CHQ-{$cheque->id}-PASS",
                $date,
                $bank->id,
                AccountingService::BANK,
                AccountingService::CHEQUES_IN_HAND,
                (float) $cheque->amount,
                "Customer cheque {$cheque->cheques_no} cleared",
                $user
            );

            return $this->finishCustomerTransition(
                $cheque,
                'passed',
                $date,
                $bank->id,
                null,
                $user
            );
        });
    }

    public function returnCustomerCheque(
        int $chequeId,
        string $date,
        string $reason,
        User $user
    ): TCusCheque {
        return DB::transaction(function () use ($chequeId, $date, $reason, $user) {
            $cheque = $this->lockCustomerCheque($chequeId, $user);
            $this->assertPending($cheque->status);
            $reversal = $this->reverseCustomerTransaction($cheque, $date, $reason, $user);

            TCustomerAccountTrance::create([
                'no' => "CUS-CHQ-{$cheque->id}-RETURN",
                'customer_code' => $reversal['customer_code'],
                'dr_amount' => $reversal['ledger_amount'] ?? $cheque->amount,
                'cr_amount' => 0,
                'trance_type' => 'CUSTOMER_CHEQUE_RETURN',
                'trance_no' => $cheque->trans_no,
                'dDate' => $date,
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);
            $this->accountingService->postJournal(
                'CUSTOMER_CHEQUE_RETURN',
                "CUS-CHQ-{$cheque->id}-RETURN",
                $date,
                [
                    ...$reversal['journal_lines'],
                    [
                        'account' => AccountingService::CHEQUES_IN_HAND,
                        'credit' => (float) $cheque->amount,
                    ],
                ],
                $user
            );

            return $this->finishCustomerTransition(
                $cheque,
                'returned',
                $date,
                null,
                $reason,
                $user
            );
        });
    }

    public function passSupplierCheque(
        int $chequeId,
        string $date,
        int $bankDetailId,
        User $user
    ): TSupCheque {
        return DB::transaction(function () use ($chequeId, $date, $bankDetailId, $user) {
            $cheque = $this->lockSupplierCheque($chequeId, $user);
            $bank = $this->findBankAccount($bankDetailId, $user->BC);
            $this->assertPending($cheque->status);

            $this->accountingService->postBalanced(
                'SUPPLIER_CHEQUE_PASS',
                "SUP-CHQ-{$cheque->id}-PASS",
                $date,
                AccountingService::CHEQUES_PAYABLE,
                AccountingService::BANK,
                (float) $cheque->amount,
                $user
            );
            $this->recordBankEntry(
                "SUP-CHQ-{$cheque->id}-PASS",
                $date,
                $bank->id,
                AccountingService::CHEQUES_PAYABLE,
                AccountingService::BANK,
                (float) $cheque->amount,
                "Supplier cheque {$cheque->cheques_no} cleared",
                $user
            );

            return $this->finishSupplierTransition(
                $cheque,
                'passed',
                $date,
                $bank->id,
                null,
                $user
            );
        });
    }

    public function returnSupplierCheque(
        int $chequeId,
        string $date,
        string $reason,
        User $user
    ): TSupCheque {
        return DB::transaction(function () use ($chequeId, $date, $reason, $user) {
            $cheque = $this->lockSupplierCheque($chequeId, $user);
            $this->assertPending($cheque->status);
            $supplierCode = $this->reverseSupplierTransaction($cheque, $user);

            TSupPurchaseTrance::create([
                'no' => "SUP-CHQ-{$cheque->id}-RETURN",
                'supplier' => $supplierCode,
                'dr_trnce_code' => '',
                'dr_trnce_no' => '',
                'dr_amount' => 0,
                'cr_trnce_code' => 'SUPPLIER_CHEQUE_RETURN',
                'cr_trnce_no' => $cheque->trans_no,
                'cr_amount' => $cheque->amount,
                'trance_type' => 'SUPPLIER_CHEQUE_RETURN',
                'trance_no' => $cheque->trans_no,
                'dDate' => $date,
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);
            $this->accountingService->postBalanced(
                'SUPPLIER_CHEQUE_RETURN',
                "SUP-CHQ-{$cheque->id}-RETURN",
                $date,
                AccountingService::CHEQUES_PAYABLE,
                AccountingService::ACCOUNTS_PAYABLE,
                (float) $cheque->amount,
                $user
            );

            return $this->finishSupplierTransition(
                $cheque,
                'returned',
                $date,
                null,
                $reason,
                $user
            );
        });
    }

    private function applyFilters(
        Builder $query,
        array $filters,
        string $dateColumn
    ): Builder {
        return $query
            ->when($filters['status'] ?? null, fn (Builder $builder, string $status) => $builder->where('status', $status))
            ->when($filters['search'] ?? null, function (Builder $builder, string $search) {
                $builder->where(function (Builder $nested) use ($search) {
                    $nested->where('cheques_no', 'like', "%{$search}%")
                        ->orWhere('trans_no', 'like', "%{$search}%")
                        ->orWhere('bank', 'like', "%{$search}%")
                        ->orWhere('acc_no', 'like', "%{$search}%");
                });
            })
            ->when($filters['date_from'] ?? null, fn (Builder $builder, string $date) => $builder->whereDate($dateColumn, '>=', $date))
            ->when($filters['date_to'] ?? null, fn (Builder $builder, string $date) => $builder->whereDate($dateColumn, '<=', $date));
    }

    private function statusSummary(Builder $query): array
    {
        $rows = $query
            ->selectRaw('status, COUNT(*) as cheque_count, COALESCE(SUM(amount), 0) as total_amount')
            ->groupBy('status')
            ->get()
            ->keyBy('status');

        $summary = [];
        foreach (['pending', 'passed', 'returned'] as $status) {
            $summary["{$status}_count"] = (int) ($rows->get($status)?->cheque_count ?? 0);
            $summary["{$status}_amount"] = (float) ($rows->get($status)?->total_amount ?? 0);
        }

        return $summary;
    }

    private function reverseCustomerTransaction(
        TCusCheque $cheque,
        string $date,
        string $reason,
        User $user
    ): array
    {
        return match ($cheque->trans_type) {
            'SALE' => $this->reverseSaleCheque($cheque, $user),
            'CUSTOMER_PAYMENT' => $this->reverseCustomerPaymentCheque($cheque, $user),
            'CUSTOMER_ADVANCE' => $this->reverseCustomerAdvanceCheque($cheque, $user),
            'HP_DOWN_PAYMENT' => $this->reverseHpDownPaymentCheque($cheque, $date, $reason, $user),
            'HP_INSTALLMENT' => $this->reverseHpInstallmentCheque($cheque, $date, $reason, $user),
            'HP_CONVERSION' => $this->reverseHpConversionCheque($cheque, $date, $reason, $user),
            default => throw ValidationException::withMessages([
                'cheque' => "Cheque source {$cheque->trans_type} cannot be reversed automatically.",
            ]),
        };
    }

    private function reverseSaleCheque(TCusCheque $cheque, User $user): array
    {
        $invoice = TInvoiceSum::query()
            ->where('Invoice_no', $cheque->trans_no)
            ->where('BC', $user->BC)
            ->lockForUpdate()
            ->firstOrFail();

        $this->reduceSalesInvoicePayment($invoice, (float) $cheque->amount);

        return $this->customerReversal(
            $invoice->customer_code,
            AccountingService::ACCOUNTS_RECEIVABLE,
            (float) $cheque->amount
        );
    }

    private function reverseCustomerPaymentCheque(TCusCheque $cheque, User $user): array
    {
        $payment = TCustomerPayment::query()
            ->where('Payment_no', $cheque->trans_no)
            ->where('BC', $user->BC)
            ->firstOrFail();
        $remaining = (float) $cheque->amount;

        $allocations = TCustomerInvoicePayment::query()
            ->where('payment_no', $payment->Payment_no)
            ->where('BC', $user->BC)
            ->orderBy('id')
            ->get();

        foreach ($allocations as $allocation) {
            if ($remaining <= 0.009) {
                break;
            }

            $reversal = min($remaining, (float) $allocation->amount_allocated);
            $invoice = TInvoiceSum::query()
                ->where('Invoice_no', $allocation->sales_invoice_no)
                ->where('BC', $user->BC)
                ->lockForUpdate()
                ->firstOrFail();
            $this->reduceSalesInvoicePayment($invoice, $reversal);
            $remaining = round($remaining - $reversal, 2);
        }

        $this->assertFullyMapped($remaining);

        $customerCode = Customer::query()
            ->where('NIC', $payment->Customer_NIC)
            ->where('BC', $user->BC)
            ->firstOrFail()
            ->Code;

        return $this->customerReversal(
            $customerCode,
            AccountingService::ACCOUNTS_RECEIVABLE,
            (float) $cheque->amount
        );
    }

    private function reverseCustomerAdvanceCheque(TCusCheque $cheque, User $user): array
    {
        $advance = TAdvancCusPayment::query()
            ->where('payment_no', $cheque->trans_no)
            ->where('BC', $user->BC)
            ->lockForUpdate()
            ->firstOrFail();
        $customer = Customer::query()
            ->where('NIC', $advance->customer_nic)
            ->where('BC', $user->BC)
            ->lockForUpdate()
            ->firstOrFail();
        $remaining = (float) $cheque->amount;
        $journalLines = [];
        $availableReversal = min($remaining, (float) $advance->remaining_amount);

        if ($availableReversal > 0) {
            $advance->remaining_amount = round(
                (float) $advance->remaining_amount - $availableReversal,
                2
            );
            $customer->advance_balance = max(
                0,
                round((float) $customer->advance_balance - $availableReversal, 2)
            );
            $remaining = round($remaining - $availableReversal, 2);
            $this->addDebit(
                $journalLines,
                AccountingService::CUSTOMER_ADVANCES,
                $availableReversal
            );
        }

        if ($remaining > 0.009) {
            $allocations = TCustomerAdvanceAllocation::query()
                ->where('advance_payment_no', $advance->payment_no)
                ->where('BC', $user->BC)
                ->orderByDesc('id')
                ->get();

            foreach ($allocations as $allocation) {
                if ($remaining <= 0.009) {
                    break;
                }

                $reversal = min($remaining, (float) $allocation->amount_allocated);
                $invoice = TInvoiceSum::query()
                    ->where('Invoice_no', $allocation->sales_invoice_no)
                    ->where('BC', $user->BC)
                    ->lockForUpdate()
                    ->firstOrFail();
                $this->reduceSalesInvoicePayment($invoice, $reversal);
                $invoice->advance_applied = max(
                    0,
                    round((float) $invoice->advance_applied - $reversal, 2)
                );
                $invoice->save();

                $newAllocation = round((float) $allocation->amount_allocated - $reversal, 2);
                if ($newAllocation <= 0.009) {
                    $allocation->delete();
                } else {
                    $allocation->amount_allocated = $newAllocation;
                    $allocation->save();
                }
                $remaining = round($remaining - $reversal, 2);
                $this->addDebit(
                    $journalLines,
                    AccountingService::ACCOUNTS_RECEIVABLE,
                    $reversal
                );
            }
        }

        if ($remaining > 0.009) {
            $allocations = TCustomerHpAdvanceAllocation::query()
                ->where('advance_payment_no', $advance->payment_no)
                ->where('BC', $user->BC)
                ->orderByDesc('id')
                ->get();

            foreach ($allocations as $allocation) {
                if ($remaining <= 0.009) {
                    break;
                }

                $reversal = min($remaining, (float) $allocation->amount_allocated);
                $agreement = THirePurchaseSum::query()
                    ->where('invoice_no', $allocation->hp_invoice_no)
                    ->where('BC', $user->BC)
                    ->lockForUpdate()
                    ->firstOrFail();
                $agreement->advance_applied = max(
                    0,
                    round((float) $agreement->advance_applied - $reversal, 2)
                );
                $agreement->paid_amount = max(
                    0,
                    round((float) $agreement->paid_amount - $reversal, 2)
                );
                $agreement->down_payment_outstanding = round(
                    (float) $agreement->down_payment_outstanding + $reversal,
                    2
                );
                $agreement->status = 'active';
                $agreement->completed_at = null;
                $agreement->save();

                $newAllocation = round((float) $allocation->amount_allocated - $reversal, 2);
                if ($newAllocation <= 0.009) {
                    $allocation->delete();
                } else {
                    $allocation->amount_allocated = $newAllocation;
                    $allocation->save();
                }

                $remaining = round($remaining - $reversal, 2);
                $this->addDebit(
                    $journalLines,
                    AccountingService::HP_RECEIVABLE,
                    $reversal
                );
            }
        }

        $this->assertFullyMapped($remaining);
        $advance->is_carried_forward = $advance->remaining_amount <= 0.009;
        $advance->save();
        $customer->save();

        return [
            'customer_code' => $customer->Code,
            'journal_lines' => $journalLines,
        ];
    }

    private function reverseHpDownPaymentCheque(
        TCusCheque $cheque,
        string $date,
        string $reason,
        User $user
    ): array {
        $invoiceNo = str_ends_with($cheque->trans_no, '-DP')
            ? substr($cheque->trans_no, 0, -3)
            : $cheque->trans_no;
        $agreement = THirePurchaseSum::query()
            ->where('invoice_no', $invoiceNo)
            ->where('BC', $user->BC)
            ->lockForUpdate()
            ->firstOrFail();
        $agreement->paid_amount = max(
            0,
            round((float) $agreement->paid_amount - (float) $cheque->amount, 2)
        );
        $agreement->down_payment_outstanding = round(
            (float) $agreement->down_payment_outstanding + (float) $cheque->amount,
            2
        );
        $agreement->status = 'active';
        $agreement->completed_at = null;
        $agreement->save();

        return $this->customerReversal(
            $agreement->customer_code,
            AccountingService::HP_RECEIVABLE,
            (float) $cheque->amount
        );
    }

    private function reverseHpInstallmentCheque(
        TCusCheque $cheque,
        string $date,
        string $reason,
        User $user
    ): array {
        $payments = THpInstallmentPayment::query()
            ->where('BC', $user->BC)
            ->where('status', 'posted')
            ->where(function ($query) use ($cheque) {
                $query->where('collection_no', $cheque->trans_no)
                    ->orWhere('payment_no', $cheque->trans_no);
            })
            ->orderBy('id')
            ->lockForUpdate()
            ->get();

        if ($payments->isEmpty()) {
            throw ValidationException::withMessages([
                'cheque' => 'The installment receipt could not be found for this cheque.',
            ]);
        }

        $journalLines = [];
        foreach ($payments as $payment) {
            $instalment = TInstalment::query()
                ->whereKey($payment->instalment_id)
                ->where('BC', $user->BC)
                ->lockForUpdate()
                ->firstOrFail();
            $principal = (float) $payment->principal_amount;
            $penalty = (float) $payment->penalty_amount;
            $discount = (float) $payment->discount_amount;
            $instalment->amount_pay = max(0, round((float) $instalment->amount_pay - $principal, 2));
            $instalment->balance_amount = round(
                (float) $instalment->balance_amount + $principal + $discount,
                2
            );
            $instalment->cheque_payment = max(
                0,
                round((float) $instalment->cheque_payment - $principal - $penalty, 2)
            );
            $instalment->discount = max(0, round((float) $instalment->discount - $discount, 2));
            $instalment->penalty_amount = max(
                0,
                round((float) $instalment->penalty_amount - $penalty, 2)
            );
            $instalment->status = $instalment->balance_amount <= 0.009
                ? 'paid'
                : (($instalment->amount_pay > 0 || $instalment->discount > 0) ? 'partial' : 'pending');
            $instalment->save();

            $payment->update([
                'status' => 'returned',
                'returned_at' => now(),
                'return_reason' => $reason,
                'UID' => $user->username,
            ]);
            $this->addDebit(
                $journalLines,
                AccountingService::HP_RECEIVABLE,
                $principal + $discount
            );
            $this->addDebit($journalLines, AccountingService::PENALTY_INCOME, $penalty);
            if ($discount > 0) {
                $journalLines[] = [
                    'account' => AccountingService::SALES_DISCOUNT,
                    'credit' => $discount,
                ];
            }
        }

        $agreement = THirePurchaseSum::query()
            ->where('invoice_no', $payments->first()->invoice_no)
            ->where('BC', $user->BC)
            ->lockForUpdate()
            ->firstOrFail();
        $agreement->paid_amount = max(
            0,
            round((float) $agreement->paid_amount - (float) $cheque->amount, 2)
        );
        $agreement->outstanding_amount = round(
            (float) $agreement->instalments()->sum('balance_amount'),
            2
        );
        $agreement->status = 'active';
        $agreement->completed_at = null;
        $agreement->save();

        return [
            'customer_code' => $agreement->customer_code,
            'journal_lines' => $journalLines,
            'ledger_amount' => round(
                (float) $cheque->amount + (float) $payments->sum('discount_amount'),
                2
            ),
        ];
    }

    private function reverseHpConversionCheque(
        TCusCheque $cheque,
        string $date,
        string $reason,
        User $user
    ): array {
        $conversion = THirePurchaseToSale::query()
            ->where('conversion_no', $cheque->trans_no)
            ->where('BC', $user->BC)
            ->where('status', 'posted')
            ->lockForUpdate()
            ->firstOrFail();
        $agreement = THirePurchaseSum::query()
            ->where('invoice_no', $conversion->invoice_no)
            ->where('BC', $user->BC)
            ->lockForUpdate()
            ->firstOrFail();

        $instalments = TInstalment::query()
            ->where('invoice_no', $agreement->invoice_no)
            ->where('BC', $user->BC)
            ->orderBy('instalment_no')
            ->lockForUpdate()
            ->get();
        foreach ($instalments as $instalment) {
            $balance = max(
                0,
                round(
                    (float) $instalment->base_amount
                    - (float) $instalment->amount_pay
                    - (float) $instalment->discount,
                    2
                )
            );
            $instalment->balance_amount = $balance;
            $instalment->status = $balance <= 0.009
                ? 'paid'
                : (($instalment->amount_pay > 0 || $instalment->discount > 0) ? 'partial' : 'pending');
            $instalment->save();
        }

        $discount = (float) $conversion->discount;
        $outstanding = round((float) $conversion->amount + $discount, 2);
        $agreement->update([
            'is_cash_converted' => false,
            'status' => 'active',
            'converted_at' => null,
            'completed_at' => null,
            'paid_amount' => max(0, round((float) $agreement->paid_amount - (float) $conversion->amount, 2)),
            'outstanding_amount' => round((float) $instalments->sum('balance_amount'), 2),
            'UID' => $user->username,
        ]);
        THirePurchaseDetail::query()
            ->where('invoice_no', $agreement->invoice_no)
            ->update(['is_cash_converted' => false, 'UID' => $user->username]);
        $conversion->update([
            'status' => 'returned',
            'returned_at' => now(),
            'return_reason' => $reason,
            'UID' => $user->username,
        ]);

        $lines = [[
            'account' => AccountingService::HP_RECEIVABLE,
            'debit' => $outstanding,
        ]];
        if ($discount > 0) {
            $lines[] = [
                'account' => AccountingService::SALES_DISCOUNT,
                'credit' => $discount,
            ];
        }

        return [
            'customer_code' => $agreement->customer_code,
            'journal_lines' => $lines,
            'ledger_amount' => $outstanding,
        ];
    }

    private function customerReversal(
        string $customerCode,
        string $account,
        float $amount
    ): array {
        return [
            'customer_code' => $customerCode,
            'journal_lines' => [[
                'account' => $account,
                'debit' => $amount,
            ]],
        ];
    }

    private function addDebit(array &$lines, string $account, float $amount): void
    {
        if ($amount <= 0.009) {
            return;
        }

        foreach ($lines as &$line) {
            if (($line['account'] ?? null) === $account && isset($line['debit'])) {
                $line['debit'] = round((float) $line['debit'] + $amount, 2);
                return;
            }
        }
        $lines[] = ['account' => $account, 'debit' => round($amount, 2)];
    }

    private function reverseSupplierTransaction(TSupCheque $cheque, User $user): string
    {
        return match ($cheque->trans_type) {
            'PURCHASE' => $this->reversePurchaseCheque($cheque, $user),
            'SUPPLIER_PAYMENT' => $this->reverseSupplierPaymentCheque($cheque, $user),
            default => throw ValidationException::withMessages([
                'cheque' => "Cheque source {$cheque->trans_type} cannot be reversed automatically.",
            ]),
        };
    }

    private function reversePurchaseCheque(TSupCheque $cheque, User $user): string
    {
        $purchase = TPurchasesSum::query()
            ->where('Invoice_no', $cheque->trans_no)
            ->where('BC', $user->BC)
            ->lockForUpdate()
            ->firstOrFail();
        $this->reducePurchasePayment($purchase, (float) $cheque->amount);

        return $purchase->supplier_code;
    }

    private function reverseSupplierPaymentCheque(TSupCheque $cheque, User $user): string
    {
        $payment = TSupplierPayment::query()
            ->where('Payment_no', $cheque->trans_no)
            ->where('BC', $user->BC)
            ->firstOrFail();
        $remaining = (float) $cheque->amount;

        $allocations = TSupplierInvoicePayment::query()
            ->where('payment_no', $payment->Payment_no)
            ->where('BC', $user->BC)
            ->orderBy('id')
            ->get();

        foreach ($allocations as $allocation) {
            if ($remaining <= 0.009) {
                break;
            }

            $reversal = min($remaining, (float) $allocation->amount_allocated);
            $purchase = TPurchasesSum::query()
                ->where('Invoice_no', $allocation->purchase_invoice_no)
                ->where('BC', $user->BC)
                ->lockForUpdate()
                ->firstOrFail();
            $this->reducePurchasePayment($purchase, $reversal);
            $remaining = round($remaining - $reversal, 2);
        }

        $this->assertFullyMapped($remaining);

        return $payment->Supplier_Code;
    }

    private function reduceSalesInvoicePayment(TInvoiceSum $invoice, float $amount): void
    {
        $invoice->paid_amount = max(0, round((float) $invoice->paid_amount - $amount, 2));
        $outstanding = max(
            0,
            round(
                (float) $invoice->Net_Amount
                - (float) $invoice->returned_amount
                - (float) $invoice->paid_amount,
                2
            )
        );
        $invoice->Credite = $outstanding;
        $invoice->payment_status = $outstanding <= 0.009
            ? 'paid'
            : ($invoice->paid_amount > 0 ? 'partial' : 'unpaid');
        $invoice->save();
    }

    private function reducePurchasePayment(TPurchasesSum $purchase, float $amount): void
    {
        $purchase->paid_amount = max(0, round((float) $purchase->paid_amount - $amount, 2));
        $outstanding = max(
            0,
            round((float) $purchase->Net_Amount - (float) $purchase->paid_amount, 2)
        );
        $purchase->credit_payment = $outstanding;
        $purchase->payment_status = $outstanding <= 0.009
            ? 'paid'
            : ($purchase->paid_amount > 0 ? 'partial' : 'unpaid');
        $purchase->save();
    }

    private function finishCustomerTransition(
        TCusCheque $cheque,
        string $status,
        string $date,
        ?int $bankDetailId,
        ?string $reason,
        User $user
    ): TCusCheque {
        $fromStatus = $cheque->status;
        $cheque->status = $status;
        $cheque->realized_date = $date;
        $cheque->bank_detail_id = $bankDetailId;
        $cheque->return_reason = $reason;
        $cheque->processed_by = $user->id;
        $cheque->status_changed_at = now();
        $cheque->save();
        $this->recordHistory('customer', $cheque->id, $fromStatus, $status, $date, $bankDetailId, $reason, $user);

        return $cheque->fresh(['sourceBank', 'sourceBranch', 'bankAccount', 'history.bankAccount']);
    }

    private function finishSupplierTransition(
        TSupCheque $cheque,
        string $status,
        string $date,
        ?int $bankDetailId,
        ?string $reason,
        User $user
    ): TSupCheque {
        $fromStatus = $cheque->status;
        $cheque->status = $status;
        $cheque->realized_date = $date;
        $cheque->bank_detail_id = $bankDetailId;
        $cheque->return_reason = $reason;
        $cheque->processed_by = $user->id;
        $cheque->status_changed_at = now();
        $cheque->save();
        $this->recordHistory('supplier', $cheque->id, $fromStatus, $status, $date, $bankDetailId, $reason, $user);

        return $cheque->fresh(['sourceBank', 'sourceBranch', 'bankAccount', 'history.bankAccount']);
    }

    private function recordHistory(
        string $type,
        int $chequeId,
        ?string $fromStatus,
        string $toStatus,
        string $date,
        ?int $bankDetailId,
        ?string $reason,
        User $user
    ): void {
        ChequeStatusHistory::create([
            'cheque_type' => $type,
            'cheque_id' => $chequeId,
            'from_status' => $fromStatus,
            'to_status' => $toStatus,
            'action_date' => $date,
            'bank_detail_id' => $bankDetailId,
            'reason' => $reason,
            'BC' => $user->BC,
            'UID' => $user->username,
        ]);
    }

    private function recordBankEntry(
        string $number,
        string $date,
        int $bankDetailId,
        string $debitCode,
        string $creditCode,
        float $amount,
        string $description,
        User $user
    ): void {
        TBankEntry::create([
            'invoice_no' => $number,
            'bank_detail_id' => $bankDetailId,
            'date' => $date,
            'cramount' => $amount,
            'crcode' => $creditCode,
            'dramount' => $amount,
            'drcode' => $debitCode,
            'description' => $description,
            'amount' => $amount,
            'bank_charges' => 0,
            'BC' => $user->BC,
            'UID' => $user->username,
        ]);
    }

    private function lockCustomerCheque(int $id, User $user): TCusCheque
    {
        return TCusCheque::query()
            ->whereKey($id)
            ->where('BC', $user->BC)
            ->lockForUpdate()
            ->firstOrFail();
    }

    private function lockSupplierCheque(int $id, User $user): TSupCheque
    {
        return TSupCheque::query()
            ->whereKey($id)
            ->where('BC', $user->BC)
            ->lockForUpdate()
            ->firstOrFail();
    }

    private function findBankAccount(int $id, string $branchCode): BankDetail
    {
        return BankDetail::query()
            ->whereKey($id)
            ->where('BC', $branchCode)
            ->firstOrFail();
    }

    private function assertPending(string $status): void
    {
        if ($status !== 'pending') {
            throw ValidationException::withMessages([
                'status' => 'Only pending cheques can be cleared or returned.',
            ]);
        }
    }

    private function assertFullyMapped(float $remaining): void
    {
        if ($remaining > 0.009) {
            throw ValidationException::withMessages([
                'cheque' => 'The cheque amount could not be mapped fully to its source transaction.',
            ]);
        }
    }
}
