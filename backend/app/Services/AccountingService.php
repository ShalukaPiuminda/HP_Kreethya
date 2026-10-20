<?php

namespace App\Services;

use App\Models\MChartofAccount;
use App\Models\MMainAccountType;
use App\Models\MMainCategory;
use App\Models\TAccountTran;
use App\Models\User;

class AccountingService
{
    public const BANK = '1002';
    public const CASH = '1001';
    public const ACCOUNTS_RECEIVABLE = '1101';
    public const CHEQUES_IN_HAND = '1102';
    public const ACCOUNTS_PAYABLE = '2001';
    public const CHEQUES_PAYABLE = '2002';
    public const CUSTOMER_ADVANCES = '2101';
    public const OPENING_BALANCE_EQUITY = '3001';
    public const INVENTORY = '1201';
    public const HP_RECEIVABLE = '1301';
    public const SERVICE_INCOME = '4001';
    public const SALES_INCOME = '4002';
    public const HP_INTEREST_INCOME = '4003';
    public const DOCUMENT_CHARGE_INCOME = '4004';
    public const TRANSPORT_INCOME = '4005';
    public const PENALTY_INCOME = '4006';
    public const SERVICE_EXPENSE = '5001';
    public const GENERAL_EXPENSE = '5002';
    public const BANK_CHARGES = '5003';
    public const SALES_DISCOUNT = '5004';

    public function postBalanced(
        string $type,
        string $number,
        string $date,
        string $debitCode,
        string $creditCode,
        float $amount,
        User $user
    ): void {
        $amount = round($amount, 2);
        if ($amount <= 0) {
            return;
        }

        $this->ensureSystemAccounts($user);

        if (TAccountTran::query()
            ->where('trance_type', $type)
            ->where('trance_no', $number)
            ->where('BC', $user->BC)
            ->exists()) {
            return;
        }

        TAccountTran::create([
            'trance_type' => $type,
            'Ddate' => $date,
            'dr_amount' => $amount,
            'cr_amount' => 0,
            'AccCode' => $debitCode,
            'trance_no' => $number,
            'no' => $number,
            'BC' => $user->BC,
            'UID' => $user->username,
        ]);

        TAccountTran::create([
            'trance_type' => $type,
            'Ddate' => $date,
            'dr_amount' => 0,
            'cr_amount' => $amount,
            'AccCode' => $creditCode,
            'trance_no' => $number,
            'no' => $number,
            'BC' => $user->BC,
            'UID' => $user->username,
        ]);
    }

    public function postJournal(
        string $type,
        string $number,
        string $date,
        array $lines,
        User $user
    ): void {
        $this->ensureSystemAccounts($user);

        if (TAccountTran::query()
            ->where('trance_type', $type)
            ->where('trance_no', $number)
            ->where('BC', $user->BC)
            ->exists()) {
            return;
        }

        $debits = round(collect($lines)->sum(fn (array $line) => (float) ($line['debit'] ?? 0)), 2);
        $credits = round(collect($lines)->sum(fn (array $line) => (float) ($line['credit'] ?? 0)), 2);

        if ($debits <= 0 || abs($debits - $credits) > 0.009) {
            throw new \InvalidArgumentException('Journal entry must contain equal positive debit and credit totals.');
        }

        foreach ($lines as $line) {
            $debit = round((float) ($line['debit'] ?? 0), 2);
            $credit = round((float) ($line['credit'] ?? 0), 2);
            if ($debit <= 0 && $credit <= 0) {
                continue;
            }

            TAccountTran::create([
                'trance_type' => $type,
                'Ddate' => $date,
                'dr_amount' => $debit,
                'cr_amount' => $credit,
                'AccCode' => $line['account'],
                'trance_no' => $number,
                'no' => $line['reference'] ?? $number,
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);
        }
    }

    public function ensureSystemAccounts(User $user): void
    {
        $assets = MMainCategory::firstOrCreate(['name' => 'Assets']);
        $liabilities = MMainCategory::firstOrCreate(['name' => 'Liabilities']);
        $equity = MMainCategory::firstOrCreate(['name' => 'Equity']);

        $cashType = MMainAccountType::firstOrCreate([
            'category_id' => $assets->id,
            'name' => 'Cash & Bank',
        ]);
        $receivableType = MMainAccountType::firstOrCreate([
            'category_id' => $assets->id,
            'name' => 'Accounts Receivable',
        ]);
        $payableType = MMainAccountType::firstOrCreate([
            'category_id' => $liabilities->id,
            'name' => 'Accounts Payable',
        ]);
        $openingBalanceType = MMainAccountType::firstOrCreate([
            'category_id' => $equity->id,
            'name' => 'Opening Balances',
        ]);
        $income = MMainCategory::firstOrCreate(['name' => 'Income']);
        $expenses = MMainCategory::firstOrCreate(['name' => 'Expenses']);
        $serviceIncomeType = MMainAccountType::firstOrCreate([
            'category_id' => $income->id,
            'name' => 'Service Income',
        ]);
        $serviceExpenseType = MMainAccountType::firstOrCreate([
            'category_id' => $expenses->id,
            'name' => 'Service Expenses',
        ]);
        $inventoryType = MMainAccountType::firstOrCreate([
            'category_id' => $assets->id,
            'name' => 'Inventory',
        ]);
        $hpReceivableType = MMainAccountType::firstOrCreate([
            'category_id' => $assets->id,
            'name' => 'HP Receivables',
        ]);
        $salesIncomeType = MMainAccountType::firstOrCreate([
            'category_id' => $income->id,
            'name' => 'Sales Income',
        ]);
        $hpIncomeType = MMainAccountType::firstOrCreate([
            'category_id' => $income->id,
            'name' => 'Hire Purchase Income',
        ]);
        $generalExpenseType = MMainAccountType::firstOrCreate([
            'category_id' => $expenses->id,
            'name' => 'Operating Expenses',
        ]);

        foreach ([
            [self::CASH, 'Cash in Hand', $cashType->id],
            [self::BANK, 'Bank Account', $cashType->id],
            [self::ACCOUNTS_RECEIVABLE, 'Accounts Receivable', $receivableType->id],
            [self::CHEQUES_IN_HAND, 'Cheques In Hand', $receivableType->id],
            [self::INVENTORY, 'Inventory - Stock', $inventoryType->id],
            [self::HP_RECEIVABLE, 'HP Receivables', $hpReceivableType->id],
            [self::ACCOUNTS_PAYABLE, 'Accounts Payable', $payableType->id],
            [self::CHEQUES_PAYABLE, 'Cheques Payable', $payableType->id],
            [self::CUSTOMER_ADVANCES, 'Customer Advances', $payableType->id],
            [self::OPENING_BALANCE_EQUITY, 'Opening Balance Equity', $openingBalanceType->id],
            [self::SERVICE_INCOME, 'Service Income', $serviceIncomeType->id],
            [self::SALES_INCOME, 'Sales Income', $salesIncomeType->id],
            [self::HP_INTEREST_INCOME, 'HP Interest Income', $hpIncomeType->id],
            [self::DOCUMENT_CHARGE_INCOME, 'Document Charge Income', $hpIncomeType->id],
            [self::TRANSPORT_INCOME, 'Transport Income', $hpIncomeType->id],
            [self::PENALTY_INCOME, 'Penalty Income', $hpIncomeType->id],
            [self::SERVICE_EXPENSE, 'Service Repair Expense', $serviceExpenseType->id],
            [self::GENERAL_EXPENSE, 'General Expense', $generalExpenseType->id],
            [self::BANK_CHARGES, 'Bank Charges', $generalExpenseType->id],
            [self::SALES_DISCOUNT, 'Sales Discounts & Returns', $generalExpenseType->id],
        ] as [$code, $description, $typeId]) {
            MChartofAccount::firstOrCreate(
                ['code' => $code],
                [
                    'description' => $description,
                    'type_id' => $typeId,
                    'BC' => $user->BC,
                    'UID' => $user->username,
                ]
            );
        }
    }
}
