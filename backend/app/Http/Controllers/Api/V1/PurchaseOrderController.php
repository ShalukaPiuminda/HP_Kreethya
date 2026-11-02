<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\TPurchaseOrderSum;
use App\Services\PurchaseService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PurchaseOrderController extends BaseController
{
    public function __construct(private readonly PurchaseService $purchaseService)
    {
    }

    public function index(Request $request)
    {
        $orders = TPurchaseOrderSum::query()
            ->where('BC', $request->user()->BC)
            ->with(['supplier', 'details.item'])
            ->withCount('receipts')
            ->when($request->query('search'), function ($query, string $search) {
                $query->where(function ($nested) use ($search) {
                    $nested->where('po_no', 'like', "%{$search}%")
                        ->orWhereHas('supplier', function ($supplierQuery) use ($search) {
                            $supplierQuery->where('name', 'like', "%{$search}%");
                        });
                });
            })
            ->when($request->query('status'), fn ($query, string $status) => $query->where('status', $status))
            ->when($request->query('supplier_code'), fn ($query, string $supplierCode) => $query->where('supplier_code', $supplierCode))
            ->when($request->query('date_from'), fn ($query, string $date) => $query->whereDate('po_date', '>=', $date))
            ->when($request->query('date_to'), fn ($query, string $date) => $query->whereDate('po_date', '<=', $date))
            ->orderByDesc('po_date')
            ->orderByDesc('id')
            ->paginate(min(max((int) $request->integer('per_page', 25), 1), 100));

        return $this->paginatedResponse($orders, 'Purchase orders retrieved successfully.');
    }

    public function store(Request $request)
    {
        $order = $this->purchaseService->createOrder(
            $this->validateOrder($request),
            $request->user()
        );

        return $this->successResponse($order, 'Purchase order created successfully.', 201);
    }

    public function show(Request $request, int $purchaseOrder)
    {
        return $this->successResponse(
            $this->findOrder($request, $purchaseOrder)->load([
                'supplier',
                'details.item',
                'receipts.store',
            ])
        );
    }

    public function update(Request $request, int $purchaseOrder)
    {
        $order = $this->purchaseService->updateOrder(
            $this->findOrder($request, $purchaseOrder),
            $this->validateOrder($request),
            $request->user()
        );

        return $this->successResponse($order, 'Purchase order updated successfully.');
    }

    public function approve(Request $request, int $purchaseOrder)
    {
        return $this->successResponse(
            $this->purchaseService->approveOrder(
                $this->findOrder($request, $purchaseOrder),
                $request->user()
            ),
            'Purchase order approved successfully.'
        );
    }

    public function cancel(Request $request, int $purchaseOrder)
    {
        return $this->successResponse(
            $this->purchaseService->cancelOrder(
                $this->findOrder($request, $purchaseOrder),
                $request->user()
            ),
            'Purchase order cancelled successfully.'
        );
    }

    public function destroy(Request $request, int $purchaseOrder)
    {
        $this->purchaseService->deleteOrder(
            $this->findOrder($request, $purchaseOrder)
        );

        return $this->successResponse(null, 'Purchase order deleted successfully.');
    }

    private function validateOrder(Request $request): array
    {
        $branchCode = $request->user()->BC;

        return $request->validate([
            'po_date' => ['required', 'date'],
            'expected_date' => ['nullable', 'date', 'after_or_equal:po_date'],
            'supplier_code' => [
                'required',
                'string',
                Rule::exists('suppliers', 'Code')->where('BC', $branchCode),
            ],
            'notes' => ['nullable', 'string', 'max:2000'],
            'items' => ['required', 'array', 'min:1'],
            'items.*.item_code' => [
                'required',
                'string',
                'distinct',
                Rule::exists('items', 'item_code')->where('BC', $branchCode),
            ],
            'items.*.qty' => ['required', 'integer', 'min:1'],
            'items.*.unit_price' => ['required', 'numeric', 'min:0.01'],
        ]);
    }

    private function findOrder(Request $request, int $id): TPurchaseOrderSum
    {
        return TPurchaseOrderSum::query()
            ->whereKey($id)
            ->where('BC', $request->user()->BC)
            ->firstOrFail();
    }
}
