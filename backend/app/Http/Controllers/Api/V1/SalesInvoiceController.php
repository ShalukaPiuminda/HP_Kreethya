<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\BranchDel;
use App\Models\Company;
use App\Models\TInvoiceSum;
use App\Services\SalesService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SalesInvoiceController extends BaseController
{
    public function __construct(private readonly SalesService $salesService)
    {
    }

    public function index(Request $request)
    {
        $invoices = TInvoiceSum::query()
            ->where('BC', $request->user()->BC)
            ->with(['customer', 'store', 'salesman', 'bankAccount', 'details.item', 'details.returnDetails'])
            ->when($request->query('search'), function ($query, string $search) {
                $query->where(function ($nested) use ($search) {
                    $nested->where('Invoice_no', 'like', "%{$search}%")
                        ->orWhere('reference_no', 'like', "%{$search}%")
                        ->orWhere('Customer_Name', 'like', "%{$search}%")
                        ->orWhere('Customer_NIC', 'like', "%{$search}%");
                });
            })
            ->when($request->query('customer_code'), fn ($query, string $customerCode) => $query->where('customer_code', $customerCode))
            ->when($request->query('payment_status'), fn ($query, string $status) => $query->where('payment_status', $status))
            ->when($request->query('date_from'), fn ($query, string $date) => $query->whereDate('Invoice_date', '>=', $date))
            ->when($request->query('date_to'), fn ($query, string $date) => $query->whereDate('Invoice_date', '<=', $date))
            ->orderByDesc('Invoice_date')
            ->orderByDesc('id')
            ->paginate(min(max((int) $request->integer('per_page', 25), 1), 100));

        return $this->paginatedResponse($invoices, 'Sales invoices retrieved successfully.');
    }

    public function store(Request $request)
    {
        $invoice = $this->salesService->createInvoice(
            $this->validateInvoice($request),
            $request->user()
        );

        return $this->successResponse($invoice, 'Sales invoice posted successfully.', 201);
    }

    public function show(Request $request, int $salesInvoice)
    {
        $invoice = TInvoiceSum::query()
            ->whereKey($salesInvoice)
            ->where('BC', $request->user()->BC)
            ->with([
                'customer',
                'store',
                'salesman',
                'bankAccount',
                'details.item',
                'details.returnDetails',
                'paymentAllocations.payment',
                'advanceAllocations.advance',
            ])
            ->firstOrFail();

        return $this->successResponse($invoice);
    }

    public function printData(Request $request, int $salesInvoice)
    {
        $invoice = TInvoiceSum::query()
            ->whereKey($salesInvoice)
            ->where('BC', $request->user()->BC)
            ->with([
                'customer',
                'store',
                'salesman',
                'bankAccount',
                'details.item',
                'details.returnDetails',
                'paymentAllocations.payment',
                'advanceAllocations.advance',
            ])
            ->firstOrFail();

        return $this->successResponse([
            'invoice' => $invoice,
            'company' => Company::query()->orderBy('id')->first(),
            'branch' => BranchDel::query()
                ->where('bccode', $invoice->BC)
                ->first(),
        ]);
    }

    private function validateInvoice(Request $request): array
    {
        $branchCode = $request->user()->BC;

        return $request->validate([
            'invoice_date' => ['required', 'date'],
            'reference_no' => ['nullable', 'string', 'max:50'],
            'customer_code' => [
                'required',
                'string',
                Rule::exists('customers', 'Code')->where('BC', $branchCode),
            ],
            'store_id' => [
                'required',
                'integer',
                Rule::exists('stores', 'id')->where('BC', $branchCode),
            ],
            'salesman_id' => [
                'nullable',
                'integer',
                Rule::exists('m_salesmen', 'id')->where('BC', $branchCode),
            ],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'discount_type' => ['nullable', Rule::in(['amount', 'percent'])],
            'advance_amount' => ['nullable', 'numeric', 'min:0'],
            'cash_payment' => ['nullable', 'numeric', 'min:0'],
            'card_payment' => ['nullable', 'numeric', 'min:0'],
            'cheque_payment' => ['nullable', 'numeric', 'min:0'],
            'bank_transfer' => ['nullable', 'numeric', 'min:0'],
            'bank_detail_id' => ['nullable', 'integer'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.item_code' => [
                'required',
                'string',
                Rule::exists('items', 'item_code')->where('BC', $branchCode),
            ],
            'items.*.qty' => ['required', 'integer', 'min:1'],
            'items.*.unit_price' => ['nullable', 'numeric', 'min:0'],
            'items.*.price_mode' => ['nullable', Rule::in(['batch', 'average', 'last'])],
            'items.*.discount' => ['nullable', 'numeric', 'min:0'],
            'items.*.discount_type' => ['nullable', Rule::in(['amount', 'percent'])],
            'items.*.batch_no' => ['nullable', 'string', 'max:50'],
            'items.*.serial_numbers' => ['nullable', 'array'],
            'items.*.serial_numbers.*' => ['required', 'string', 'max:100', 'distinct'],
            'cheque' => ['nullable', 'array'],
            'cheque.bank_id' => ['nullable', 'integer'],
            'cheque.bank_branch_id' => ['nullable', 'integer'],
            'cheque.cheque_no' => ['nullable', 'string', 'max:50'],
            'cheque.account_no' => ['nullable', 'string', 'max:50'],
            'cheque.due_date' => ['nullable', 'date'],
        ]);
    }
}
