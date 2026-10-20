<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\MChartofAccount;
use App\Models\TBankEntry;
use App\Models\TExpense;
use App\Models\TPaymentVoucher;
use App\Services\FinancialService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class FinancialController extends BaseController
{
    public function __construct(private readonly FinancialService $financialService)
    {
    }

    public function options(Request $request)
    {
        return $this->successResponse($this->financialService->options($request->user()));
    }

    public function summary(Request $request)
    {
        return $this->successResponse($this->financialService->summary($request->user()));
    }

    public function accounts(Request $request)
    {
        $accounts = MChartofAccount::query()
            ->where('BC', $request->user()->BC)
            ->with('type.category')
            ->withSum('transactions as debit_total', 'dr_amount')
            ->withSum('transactions as credit_total', 'cr_amount')
            ->orderBy('code')
            ->get()
            ->each(function (MChartofAccount $account) {
                $account->setAttribute(
                    'balance',
                    round((float) $account->opening_balance + (float) $account->debit_total - (float) $account->credit_total, 2)
                );
            });

        return $this->successResponse($accounts);
    }

    public function storeAccount(Request $request)
    {
        $validated = $request->validate([
            'code' => ['required', 'string', 'max:20', 'unique:m_chartof_accounts,code'],
            'description' => ['required', 'string', 'max:150'],
            'type_id' => ['required', 'integer', 'exists:m_main_account_types,id'],
            'is_active' => ['nullable', 'boolean'],
            'opening_balance' => ['nullable', 'numeric'],
        ]);
        return $this->successResponse(
            $this->financialService->createAccount($validated, $request->user()),
            'Account created.',
            201
        );
    }

    public function updateAccount(Request $request, int $id)
    {
        $account = MChartofAccount::query()->whereKey($id)->where('BC', $request->user()->BC)->firstOrFail();
        $validated = $request->validate([
            'description' => ['required', 'string', 'max:150'],
            'type_id' => ['required', 'integer', 'exists:m_main_account_types,id'],
            'is_active' => ['nullable', 'boolean'],
            'opening_balance' => ['nullable', 'numeric'],
        ]);
        return $this->successResponse($this->financialService->updateAccount($account, $validated, $request->user()), 'Account updated.');
    }

    public function deleteAccount(Request $request, int $id)
    {
        $account = MChartofAccount::query()->whereKey($id)->where('BC', $request->user()->BC)->firstOrFail();
        $this->financialService->deleteAccount($account);
        return $this->successResponse(null, 'Account deleted.');
    }

    public function vouchers(Request $request)
    {
        $rows = TPaymentVoucher::query()
            ->where('BC', $request->user()->BC)
            ->with(['debitAccount', 'creditAccount', 'bankAccount'])
            ->when($request->query('status'), fn ($query, string $status) => $query->where('status', $status))
            ->orderByDesc('date')
            ->orderByDesc('id')
            ->paginate(100);
        return $this->paginatedResponse($rows);
    }

    public function storeVoucher(Request $request)
    {
        $validated = $request->validate([
            'date' => ['required', 'date'],
            'debit_account_code' => ['required', 'string'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'payment_method' => ['required', Rule::in(['cash', 'bank'])],
            'bank_detail_id' => ['nullable', 'integer'],
            'description' => ['nullable', 'string', 'max:1000'],
        ]);
        return $this->successResponse($this->financialService->createVoucher($validated, $request->user()), 'Draft voucher created.', 201);
    }

    public function postVoucher(Request $request, int $id)
    {
        $voucher = TPaymentVoucher::query()->whereKey($id)->where('BC', $request->user()->BC)->firstOrFail();
        return $this->successResponse($this->financialService->postVoucher($voucher, $request->user()), 'Voucher posted.');
    }

    public function cancelVoucher(Request $request, int $id)
    {
        $validated = $request->validate(['reason' => ['required', 'string', 'max:1000']]);
        $voucher = TPaymentVoucher::query()->whereKey($id)->where('BC', $request->user()->BC)->firstOrFail();
        return $this->successResponse($this->financialService->cancelVoucher($voucher, $validated['reason'], $request->user()), 'Voucher cancelled.');
    }

    public function expenses(Request $request)
    {
        $rows = TExpense::query()
            ->where('BC', $request->user()->BC)
            ->with(['account', 'bankAccount'])
            ->orderByDesc('Expense_date')
            ->orderByDesc('id')
            ->paginate(100);
        return $this->paginatedResponse($rows);
    }

    public function storeExpense(Request $request)
    {
        $validated = $request->validate([
            'expense_date' => ['required', 'date'],
            'expense_account_code' => ['required', 'string'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'payment_method' => ['required', Rule::in(['cash', 'bank'])],
            'bank_detail_id' => ['nullable', 'integer'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);
        return $this->successResponse($this->financialService->createExpense($validated, $request->user()), 'Expense posted.', 201);
    }

    public function bankEntries(Request $request)
    {
        $rows = TBankEntry::query()
            ->where('BC', $request->user()->BC)
            ->with(['bankAccount', 'debitAccount', 'creditAccount'])
            ->orderByDesc('date')
            ->orderByDesc('id')
            ->paginate(100);
        return $this->paginatedResponse($rows);
    }

    public function storeBankEntry(Request $request)
    {
        $validated = $request->validate([
            'date' => ['required', 'date'],
            'bank_detail_id' => ['required', 'integer'],
            'entry_type' => ['required', Rule::in(['deposit', 'withdrawal'])],
            'offset_account_code' => ['required', 'string'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'bank_charges' => ['nullable', 'numeric', 'min:0'],
            'description' => ['nullable', 'string', 'max:1000'],
        ]);
        return $this->successResponse($this->financialService->createBankEntry($validated, $request->user()), 'Bank entry posted.', 201);
    }
}
