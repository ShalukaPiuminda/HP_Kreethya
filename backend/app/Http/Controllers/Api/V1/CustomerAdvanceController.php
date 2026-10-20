<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\TAdvancCusPayment;
use App\Services\SalesService;
use App\Services\Sms\SmsService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class CustomerAdvanceController extends BaseController
{
    public function __construct(
        private readonly SalesService $salesService,
        private readonly SmsService $sms
    ) {
    }

    public function index(Request $request)
    {
        $advances = TAdvancCusPayment::query()
            ->where('BC', $request->user()->BC)
            ->with(['customer', 'allocations.invoice', 'hpAllocations.agreement', 'bankAccount'])
            ->when($request->query('customer_code'), function ($query, string $customerCode) {
                $query->whereHas('customer', fn ($customerQuery) => $customerQuery->where('Code', $customerCode));
            })
            ->orderByDesc('payment_date')
            ->orderByDesc('id')
            ->paginate(min(max((int) $request->integer('per_page', 25), 1), 100));

        return $this->paginatedResponse($advances, 'Customer advances retrieved successfully.');
    }

    public function store(Request $request)
    {
        $validated = $this->validateAdvance($request);
        $advance = $this->salesService->createAdvance($validated, $request->user());
        $sms = $this->sms->notifyCustomerPayment(
            'advance',
            $validated['customer_code'],
            (string) $advance->payment_no,
            (float) $validated['amount'],
            0.0,
            $request->user()
        );

        return $this->successResponse($advance, 'Customer advance recorded successfully.'.SmsService::statusLabel($sms), 201);
    }

    public function show(Request $request, int $customerAdvance)
    {
        $advance = TAdvancCusPayment::query()
            ->whereKey($customerAdvance)
            ->where('BC', $request->user()->BC)
            ->with(['customer', 'allocations.invoice', 'hpAllocations.agreement', 'bankAccount'])
            ->firstOrFail();

        return $this->successResponse($advance);
    }

    private function validateAdvance(Request $request): array
    {
        $branchCode = $request->user()->BC;

        return $request->validate([
            'payment_date' => ['required', 'date'],
            'customer_code' => [
                'required',
                'string',
                Rule::exists('customers', 'Code')->where('BC', $branchCode),
            ],
            'payment_note' => ['nullable', 'string', 'max:2000'],
            'amount' => ['required', 'numeric', 'min:0.01'],
            'cash_payment' => ['nullable', 'numeric', 'min:0'],
            'card_payment' => ['nullable', 'numeric', 'min:0'],
            'cheque_payment' => ['nullable', 'numeric', 'min:0'],
            'bank_transfer' => ['nullable', 'numeric', 'min:0'],
            'bank_detail_id' => ['nullable', 'integer'],
            'cheque' => ['nullable', 'array'],
            'cheque.bank_id' => ['nullable', 'integer'],
            'cheque.bank_branch_id' => ['nullable', 'integer'],
            'cheque.cheque_no' => ['nullable', 'string', 'max:50'],
            'cheque.account_no' => ['nullable', 'string', 'max:50'],
            'cheque.due_date' => ['nullable', 'date'],
        ]);
    }
}
