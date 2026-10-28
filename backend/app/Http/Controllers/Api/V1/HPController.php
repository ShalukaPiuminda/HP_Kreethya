<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\THirePurchaseSum;
use App\Models\TInstalment;
use App\Services\HPService;
use App\Services\Sms\SmsService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class HPController extends BaseController
{
    public function __construct(
        private readonly HPService $hpService,
        private readonly SmsService $sms
    ) {
    }

    public function calculate(Request $request)
    {
        $validated = $request->validate([
            'schema_type' => ['required', 'string'],
            'net_amount' => ['required', 'numeric', 'min:0.01'],
            'down_payment' => ['required', 'numeric', 'min:0'],
            'transport' => ['nullable', 'numeric', 'min:0'],
        ]);

        return $this->successResponse(
            $this->hpService->calculate($validated, $request->user()->BC),
            'Hire purchase calculation completed.'
        );
    }

    public function options(Request $request)
    {
        return $this->successResponse($this->hpService->options($request->user()));
    }

    public function index(Request $request)
    {
        $agreements = THirePurchaseSum::query()
            ->where('BC', $request->user()->BC)
            ->with(['customer', 'store', 'conversions'])
            ->when($request->query('search'), function ($query, string $search) {
                $query->where(function ($nested) use ($search) {
                    $nested->where('invoice_no', 'like', "%{$search}%")
                        ->orWhere('agreement_no', 'like', "%{$search}%")
                        ->orWhere('customer_name', 'like', "%{$search}%")
                        ->orWhere('customer_nic', 'like', "%{$search}%");
                });
            })
            ->when($request->query('status'), fn ($query, string $status) => $query->where('status', $status))
            ->when($request->query('date_from'), fn ($query, string $date) => $query->whereDate('invoice_date', '>=', $date))
            ->when($request->query('date_to'), fn ($query, string $date) => $query->whereDate('invoice_date', '<=', $date))
            ->orderByDesc('invoice_date')
            ->orderByDesc('id')
            ->paginate(min(max((int) $request->integer('per_page', 25), 1), 100));

        return $this->paginatedResponse($agreements, 'Hire purchase agreements retrieved.');
    }

    public function show(Request $request, int $id)
    {
        return $this->successResponse($this->hpService->loadAgreement($id, $request->user()->BC));
    }

    public function store(Request $request)
    {
        $agreement = $this->hpService->createAgreement(
            $this->validateAgreement($request),
            $request->user()
        );
        $sms = $this->sms->notifyHpPayment($agreement, (float) $agreement->paid_amount, $request->user());

        return $this->successResponse($agreement, 'Hire purchase agreement created.'.SmsService::statusLabel($sms), 201);
    }

    public function storeOpening(Request $request)
    {
        $agreement = $this->hpService->createOpeningAgreement(
            $this->validateOpeningAgreement($request),
            $request->user()
        );

        return $this->successResponse($agreement, 'Opening hire purchase agreement created.', 201);
    }

    public function getInstallment(Request $request, int $id)
    {
        $instalment = TInstalment::query()
            ->whereKey($id)
            ->where('BC', $request->user()->BC)
            ->with(['sum.schema', 'payments.bankAccount'])
            ->firstOrFail();
        $penalty = $this->hpService->calculatePenalty(
            (float) $instalment->balance_amount,
            $instalment->instalment_date->format('Y-m-d'),
            (float) $instalment->sum->schema->PanaltyCharage,
            (int) $instalment->sum->schema->GracePeriodDays,
            $request->query('as_of')
        );

        return $this->successResponse(compact('instalment', 'penalty'));
    }

    public function payInstallment(Request $request, int $id)
    {
        $validated = $request->validate([
            'payment_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'min:0'],
            'payment_method' => ['required', Rule::in(['cash', 'card', 'cheque', 'bank_transfer'])],
            'bank_detail_id' => ['nullable', 'integer'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'waive_penalty' => ['nullable', 'boolean'],
            'note' => ['nullable', 'string', 'max:1000'],
            'cheque' => ['nullable', 'array'],
            'cheque.bank_id' => ['nullable', 'integer'],
            'cheque.bank_branch_id' => ['nullable', 'integer'],
            'cheque.cheque_no' => ['nullable', 'string', 'max:50'],
            'cheque.account_no' => ['nullable', 'string', 'max:50'],
            'cheque.due_date' => ['nullable', 'date'],
        ]);

        $agreement = $this->hpService->payInstallment($id, $validated, $request->user());
        // Sent right after the payment transaction commits; failures are only logged.
        $sms = $this->sms->notifyHpPayment($agreement, (float) $validated['amount'], $request->user());

        return $this->successResponse(
            $agreement,
            'Installment payment recorded.'.SmsService::statusLabel($sms)
        );
    }

    public function installments(Request $request)
    {
        $installments = TInstalment::query()
            ->where('BC', $request->user()->BC)
            ->with('sum:id,invoice_no,agreement_no,customer_name,status')
            ->when($request->query('invoice_no'), fn ($query, string $invoiceNo) => $query->where('invoice_no', $invoiceNo))
            ->when($request->query('status'), fn ($query, string $status) => $query->where('status', $status))
            ->when($request->query('due_from'), fn ($query, string $date) => $query->whereDate('instalment_date', '>=', $date))
            ->when($request->query('due_to'), fn ($query, string $date) => $query->whereDate('instalment_date', '<=', $date))
            ->when($request->boolean('overdue'), fn ($query) => $query
                ->whereIn('status', ['pending', 'partial'])
                ->whereDate('instalment_date', '<', today()))
            ->orderBy('instalment_date')
            ->paginate(min(max((int) $request->integer('per_page', 50), 1), 100));

        return $this->paginatedResponse($installments, 'Installments retrieved.');
    }

    public function convert(Request $request, int $id)
    {
        $validated = $request->validate([
            'conversion_date' => ['required', 'date'],
            'amount' => ['required', 'numeric', 'min:0'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'payment_method' => ['required', Rule::in(['cash', 'card', 'cheque', 'bank_transfer'])],
            'bank_detail_id' => ['nullable', 'integer'],
            'note' => ['nullable', 'string', 'max:1000'],
            'cheque' => ['nullable', 'array'],
            'cheque.bank_id' => ['nullable', 'integer'],
            'cheque.bank_branch_id' => ['nullable', 'integer'],
            'cheque.cheque_no' => ['nullable', 'string', 'max:50'],
            'cheque.account_no' => ['nullable', 'string', 'max:50'],
            'cheque.due_date' => ['nullable', 'date'],
        ]);

        $agreement = $this->hpService->convertToCash($id, $validated, $request->user());
        $sms = $this->sms->notifyHpPayment($agreement, (float) $validated['amount'], $request->user());

        return $this->successResponse(
            $agreement,
            'Agreement paid at once.'.SmsService::statusLabel($sms)
        );
    }

    public function returnAgreement(Request $request, int $id)
    {
        $branchCode = $request->user()->BC;
        $validated = $request->validate([
            'return_date' => ['required', 'date'],
            'store_id' => ['required', 'integer', Rule::exists('stores', 'id')->where('BC', $branchCode)],
            'reason' => ['required', 'string', 'max:1000'],
            'refund_amount' => ['nullable', 'numeric', 'min:0'],
            'refund_method' => ['nullable', Rule::in(['cash', 'card', 'cheque', 'bank_transfer'])],
            'bank_detail_id' => ['nullable', 'integer'],
        ]);

        return $this->successResponse(
            $this->hpService->returnAgreement($id, $validated, $request->user()),
            'Hire purchase return posted.'
        );
    }

    public function summary(Request $request)
    {
        return $this->successResponse(
            $this->hpService->getDashboardSummary($request->user()->BC)
        );
    }

    private function validateAgreement(Request $request): array
    {
        $branchCode = $request->user()->BC;

        return $request->validate([
            'invoice_date' => ['required', 'date'],
            'reference_no' => ['nullable', 'string', 'max:50'],
            'customer_code' => ['required', 'string', Rule::exists('customers', 'Code')->where('BC', $branchCode)],
            'guarantor_1_code' => ['required', 'string', Rule::exists('m_guarantors', 'Code')->where('BC', $branchCode)],
            'guarantor_2_code' => ['nullable', 'string', 'different:guarantor_1_code', Rule::exists('m_guarantors', 'Code')->where('BC', $branchCode)],
            'schema_type' => ['required', 'string', Rule::exists('m_schemas', 'SchemaType')->where('BC', $branchCode)],
            'store_id' => ['required', 'integer', Rule::exists('stores', 'id')->where('BC', $branchCode)],
            'down_payment' => ['required', 'numeric', 'min:0'],
            'advance_amount' => ['nullable', 'numeric', 'min:0'],
            'down_payment_method' => ['required', Rule::in(['cash', 'card', 'cheque', 'bank_transfer'])],
            'bank_detail_id' => ['nullable', 'integer'],
            'transport' => ['nullable', 'numeric', 'min:0'],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'discount_type' => ['nullable', Rule::in(['amount', 'percent'])],
            'instalment_due_date' => ['required', 'integer', 'between:1,28'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.item_code' => ['required', 'string', Rule::exists('items', 'item_code')->where('BC', $branchCode)],
            'items.*.qty' => ['required', 'integer', 'min:1'],
            'items.*.unit_price' => ['nullable', 'numeric', 'min:0'],
            'items.*.discount' => ['nullable', 'numeric', 'min:0'],
            'items.*.discount_type' => ['nullable', Rule::in(['amount', 'percent'])],
            'items.*.batch_no' => ['nullable', 'string', 'max:50'],
            'items.*.serial_numbers' => ['nullable', 'array'],
            'items.*.serial_numbers.*' => ['required', 'string', 'max:100', 'distinct'],
            'items.*.warranty_enabled' => ['sometimes', 'boolean'],
            'items.*.warranty_months' => ['nullable', 'integer', 'min:1', 'max:120'],
            'cheque' => ['nullable', 'array'],
            'cheque.bank_id' => ['nullable', 'integer'],
            'cheque.bank_branch_id' => ['nullable', 'integer'],
            'cheque.cheque_no' => ['nullable', 'string', 'max:50'],
            'cheque.account_no' => ['nullable', 'string', 'max:50'],
            'cheque.due_date' => ['nullable', 'date'],
        ]);
    }

    private function validateOpeningAgreement(Request $request): array
    {
        $branchCode = $request->user()->BC;

        return $request->validate([
            'invoice_date' => ['required', 'date'],
            'reference_no' => ['nullable', 'string', 'max:50'],
            'opening_reference_no' => ['nullable', 'string', 'max:100'],
            'opening_note' => ['nullable', 'string', 'max:1000'],
            'customer_code' => ['required', 'string', Rule::exists('customers', 'Code')->where('BC', $branchCode)],
            'guarantor_1_code' => ['nullable', 'string', Rule::exists('m_guarantors', 'Code')->where('BC', $branchCode)],
            'guarantor_2_code' => ['nullable', 'string', 'different:guarantor_1_code', Rule::exists('m_guarantors', 'Code')->where('BC', $branchCode)],
            'schema_type' => ['required', 'string', Rule::exists('m_schemas', 'SchemaType')->where('BC', $branchCode)],
            'store_id' => ['required', 'integer', Rule::exists('stores', 'id')->where('BC', $branchCode)],
            'items' => ['required', 'array', 'min:1'],
            'items.*.item_code' => ['required', 'string', Rule::exists('items', 'item_code')->where('BC', $branchCode)],
            'items.*.qty' => ['required', 'integer', 'min:1'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0.01'],
            'items.*.net_value' => ['nullable', 'numeric', 'min:0.01'],
            'items.*.batch_no' => ['nullable', 'string', 'max:50'],
            'items.*.serial_numbers' => ['nullable', 'array'],
            'items.*.serial_numbers.*' => ['required', 'string', 'max:100', 'distinct'],
            'items.*.warranty_enabled' => ['sometimes', 'boolean'],
            'items.*.warranty_months' => ['nullable', 'integer', 'min:1', 'max:120'],
            'installments' => ['required', 'array', 'min:1'],
            'installments.*.instalment_no' => ['required', 'integer', 'min:1', 'distinct'],
            'installments.*.instalment_date' => ['required', 'date'],
            'installments.*.base_amount' => ['required', 'numeric', 'min:0.01'],
            'installments.*.amount_pay' => ['nullable', 'numeric', 'min:0'],
            'installments.*.balance_amount' => ['nullable', 'numeric', 'min:0'],
        ]);
    }
}
