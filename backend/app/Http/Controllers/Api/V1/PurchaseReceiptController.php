<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\TPurchaseOrderSum;
use App\Models\TPurchasesSum;
use App\Services\PurchaseService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PurchaseReceiptController extends BaseController
{
    public function __construct(private readonly PurchaseService $purchaseService)
    {
    }

    public function index(Request $request)
    {
        $receipts = TPurchasesSum::query()
            ->where('BC', $request->user()->BC)
            ->with(['supplier', 'order', 'store', 'details.item'])
            ->when($request->query('search'), function ($query, string $search) {
                $query->where(function ($nested) use ($search) {
                    $nested->where('Invoice_no', 'like', "%{$search}%")
                        ->orWhere('Ref_no', 'like', "%{$search}%")
                        ->orWhereHas('supplier', function ($supplierQuery) use ($search) {
                            $supplierQuery->where('name', 'like', "%{$search}%");
                        });
                });
            })
            ->when($request->query('supplier_code'), fn ($query, string $supplierCode) => $query->where('supplier_code', $supplierCode))
            ->when($request->query('payment_status'), fn ($query, string $status) => $query->where('payment_status', $status))
            ->when($request->query('date_from'), fn ($query, string $date) => $query->whereDate('Invoice_date', '>=', $date))
            ->when($request->query('date_to'), fn ($query, string $date) => $query->whereDate('Invoice_date', '<=', $date))
            ->orderByDesc('Invoice_date')
            ->orderByDesc('id')
            ->paginate(min(max((int) $request->integer('per_page', 25), 1), 100));

        return $this->paginatedResponse($receipts, 'Purchase receipts retrieved successfully.');
    }

    public function openOrders(Request $request)
    {
        $orders = TPurchaseOrderSum::query()
            ->where('BC', $request->user()->BC)
            ->whereIn('status', ['approved', 'partially_received'])
            ->when($request->query('supplier_code'), fn ($query, string $supplierCode) => $query->where('supplier_code', $supplierCode))
            ->with(['supplier', 'details.item'])
            ->orderBy('po_date')
            ->get()
            ->map(function (TPurchaseOrderSum $order) {
                $order->details->each(function ($detail) {
                    $detail->setAttribute(
                        'remaining_qty',
                        max(0, (int) $detail->qty - (int) $detail->received_qty)
                    );
                });

                return $order;
            });

        return $this->successResponse($orders, 'Open purchase orders retrieved successfully.');
    }

    public function store(Request $request)
    {
        $receipt = $this->purchaseService->createReceipt(
            $this->validateReceipt($request),
            $request->user()
        );

        return $this->successResponse($receipt, 'Purchase receipt created successfully.', 201);
    }

    public function show(Request $request, int $purchaseReceipt)
    {
        $receipt = TPurchasesSum::query()
            ->whereKey($purchaseReceipt)
            ->where('BC', $request->user()->BC)
            ->with(['supplier', 'order', 'store', 'details.item', 'allocations.payment'])
            ->firstOrFail();

        return $this->successResponse($receipt);
    }

    public function updateSerials(Request $request, int $purchaseReceipt)
    {
        $receipt = TPurchasesSum::query()
            ->whereKey($purchaseReceipt)
            ->where('BC', $request->user()->BC)
            ->firstOrFail();

        $validated = $request->validate([
            'detail_id' => ['required', 'integer'],
            'serial_numbers' => ['required', 'array', 'min:1'],
            'serial_numbers.*' => ['required', 'string', 'max:100', 'distinct'],
        ]);

        $receipt = $this->purchaseService->updateReceiptSerials(
            $receipt,
            (int) $validated['detail_id'],
            $validated['serial_numbers'],
            $request->user()
        );

        return $this->successResponse($receipt, 'Purchase receipt serial numbers updated successfully.');
    }

    private function validateReceipt(Request $request): array
    {
        $branchCode = $request->user()->BC;

        return $request->validate([
            'invoice_date' => ['required', 'date'],
            'reference_no' => ['nullable', 'string', 'max:50'],
            'supplier_code' => [
                'required',
                'string',
                Rule::exists('suppliers', 'Code')->where('BC', $branchCode),
            ],
            'purchase_order_no' => [
                'nullable',
                'string',
                Rule::exists('t_purchase_order_sums', 'po_no')->where('BC', $branchCode),
            ],
            'store_id' => [
                'required',
                'integer',
                Rule::exists('stores', 'id')->where('BC', $branchCode),
            ],
            'discount' => ['nullable', 'numeric', 'min:0'],
            'discount_type' => ['nullable', Rule::in(['amount', 'percent'])],
            'cash_payment' => ['nullable', 'numeric', 'min:0'],
            'cheque_payment' => ['nullable', 'numeric', 'min:0'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.item_code' => [
                'required',
                'string',
                'distinct',
                Rule::exists('items', 'item_code')->where('BC', $branchCode),
            ],
            'items.*.qty' => ['required', 'integer', 'min:1'],
            'items.*.free_qty' => ['nullable', 'integer', 'min:0'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0'],
            'items.*.sales_price' => ['nullable', 'numeric', 'min:0'],
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
            'cheque.release_date' => ['nullable', 'date'],
        ]);
    }
}
