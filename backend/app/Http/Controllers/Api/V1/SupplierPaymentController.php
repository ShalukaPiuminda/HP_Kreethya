<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\TSupplierPayment;
use App\Services\PurchaseService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SupplierPaymentController extends BaseController
{
    public function __construct(private readonly PurchaseService $purchaseService)
    {
    }

    public function index(Request $request)
    {
        $payments = TSupplierPayment::query()
            ->where('BC', $request->user()->BC)
            ->with(['supplier', 'allocations.purchase', 'bankAccount'])
            ->when($request->query('search'), function ($query, string $search) {
                $query->where(function ($nested) use ($search) {
                    $nested->where('Payment_no', 'like', "%{$search}%")
                        ->orWhere('Supplier_Name', 'like', "%{$search}%");
                });
            })
            ->when($request->query('supplier_code'), fn ($query, string $supplierCode) => $query->where('Supplier_Code', $supplierCode))
            ->when($request->query('date_from'), fn ($query, string $date) => $query->whereDate('Payment_date', '>=', $date))
            ->when($request->query('date_to'), fn ($query, string $date) => $query->whereDate('Payment_date', '<=', $date))
            ->orderByDesc('Payment_date')
            ->orderByDesc('id')
            ->paginate(min(max((int) $request->integer('per_page', 25), 1), 100));

        return $this->paginatedResponse($payments, 'Supplier payments retrieved successfully.');
    }

    public function outstanding(Request $request)
    {
        $validated = $request->validate([
            'supplier_code' => [
                'required',
                'string',
                Rule::exists('suppliers', 'Code')->where('BC', $request->user()->BC),
            ],
        ]);

        return $this->successResponse(
            $this->purchaseService->supplierOutstanding(
                $validated['supplier_code'],
                $request->user()->BC
            ),
            'Supplier outstanding invoices retrieved successfully.'
        );
    }

    public function store(Request $request)
    {
        $payment = $this->purchaseService->createPayment(
            $this->validatePayment($request),
            $request->user()
        );

        return $this->successResponse($payment, 'Supplier payment created successfully.', 201);
    }

    public function show(Request $request, int $supplierPayment)
    {
        $payment = TSupplierPayment::query()
            ->whereKey($supplierPayment)
            ->where('BC', $request->user()->BC)
            ->with(['supplier', 'allocations.purchase', 'bankAccount'])
            ->firstOrFail();

        return $this->successResponse($payment);
    }

    private function validatePayment(Request $request): array
    {
        $branchCode = $request->user()->BC;

        return $request->validate([
            'payment_date' => ['required', 'date'],
            'supplier_code' => [
                'required',
                'string',
                Rule::exists('suppliers', 'Code')->where('BC', $branchCode),
            ],
            'payment_note' => ['nullable', 'string', 'max:2000'],
            'payment_amount' => ['required', 'numeric', 'min:0.01'],
            'cash_payment' => ['nullable', 'numeric', 'min:0'],
            'card_payment' => ['nullable', 'numeric', 'min:0'],
            'cheque_payment' => ['nullable', 'numeric', 'min:0'],
            'bank_transfer' => ['nullable', 'numeric', 'min:0'],
            'bank_detail_id' => ['nullable', 'integer'],
            'allocations' => ['required', 'array', 'min:1'],
            'allocations.*.purchase_invoice_no' => [
                'required',
                'string',
                'distinct',
                Rule::exists('t_purchases_sums', 'Invoice_no')->where('BC', $branchCode),
            ],
            'allocations.*.amount' => ['required', 'numeric', 'min:0.01'],
            'cheque' => ['nullable', 'array'],
            'cheque.bank_id' => ['nullable', 'integer'],
            'cheque.bank_branch_id' => ['nullable', 'integer'],
            'cheque.cheque_no' => ['nullable', 'string', 'max:50'],
            'cheque.account_no' => ['nullable', 'string', 'max:50'],
            'cheque.release_date' => ['nullable', 'date'],
        ]);
    }
}
