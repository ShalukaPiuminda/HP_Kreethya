<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Item;
use App\Models\ItemBatch;
use App\Models\TItemMovement;
use App\Models\TItemSerialMovement;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class StockController extends BaseController
{
    public function __construct(private StockService $stockService)
    {
    }

    public function index(Request $request)
    {
        return $this->successResponse(
            $this->stockService->getInventorySnapshot(
                auth()->user()->BC,
                $request->query('search')
            ),
            'Stock levels retrieved successfully.'
        );
    }

    public function stockLevel($itemCode)
    {
        try {
            return $this->successResponse(
                $this->stockService->getStockLevel($itemCode, auth()->user()->BC)
            );
        } catch (\Exception $e) {
            return $this->errorResponse('Stock item not found.', 404);
        }
    }

    public function receive(Request $request)
    {
        $validated = $request->validate([
            'item_code' => 'required|string|exists:items,item_code',
            'batch_no' => 'nullable|string|max:50',
            'store_id' => 'required|exists:stores,id',
            'qty' => 'required|integer|min:1',
            'purchase_price' => 'required|numeric|min:0',
            'sales_price' => 'required|numeric|min:0',
            'serial_numbers' => 'nullable|array',
            'serial_numbers.*' => 'string|max:100|distinct',
        ]);

        $item = Item::where('item_code', $validated['item_code'])
            ->where('BC', auth()->user()->BC)
            ->firstOrFail();

        if (!$item->is_batch) {
            $validated['batch_no'] = null;
            $validated['purchase_price'] = (float) $item->standard_purchase_price;
            $validated['sales_price'] = (float) $item->standard_sales_price;
        }

        $transNo = $this->stockService->generateTransNo('OPS', auth()->user()->BC);

        try {
            $this->stockService->receiveStock(
                $transNo,
                'OPS',
                $validated['item_code'],
                $validated['batch_no'] ?? null,
                $validated['store_id'],
                $validated['qty'],
                $validated['purchase_price'],
                $validated['sales_price'],
                auth()->user()->BC,
                auth()->user()->username,
                $validated['serial_numbers'] ?? null
            );
        } catch (\InvalidArgumentException|\RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), 422);
        }

        return $this->successResponse([
            'trans_no' => $transNo,
        ], 'Opening stock received successfully.', 201);
    }

    public function transfer(Request $request)
    {
        $validated = $request->validate([
            'item_code' => 'required|string|exists:items,item_code',
            'batch_no' => 'nullable|string|max:50',
            'from_store_id' => 'required|exists:stores,id',
            'to_store_id' => 'required|exists:stores,id|different:from_store_id',
            'qty' => 'required|integer|min:1',
            'serial_numbers' => 'nullable|array',
            'serial_numbers.*' => 'string|max:100|distinct',
        ]);

        $transNo = $this->stockService->generateTransNo('TRF', auth()->user()->BC);

        try {
            $this->stockService->transferStock(
                $transNo,
                $validated['item_code'],
                $validated['batch_no'] ?? null,
                $validated['from_store_id'],
                $validated['to_store_id'],
                $validated['qty'],
                auth()->user()->BC,
                auth()->user()->username,
                $validated['serial_numbers'] ?? null
            );
        } catch (\InvalidArgumentException|\RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), 422);
        }

        return $this->successResponse([
            'trans_no' => $transNo,
        ], 'Stock transferred successfully.', 201);
    }

    public function updateOpeningSerials(Request $request, string $transNo)
    {
        $branchCode = $request->user()->BC;
        $validated = $request->validate([
            'item_code' => [
                'required',
                'string',
                Rule::exists('items', 'item_code')->where('BC', $branchCode),
            ],
            'store_id' => [
                'required',
                'integer',
                Rule::exists('stores', 'id')->where('BC', $branchCode),
            ],
            'serial_numbers' => ['required', 'array', 'min:1'],
            'serial_numbers.*' => ['required', 'string', 'max:100', 'distinct'],
        ]);

        try {
            $serials = $this->stockService->replaceReceivedSerials(
                $transNo,
                'OPS',
                $validated['item_code'],
                (int) $validated['store_id'],
                $validated['serial_numbers'],
                $branchCode,
                $request->user()->username
            );
        } catch (ValidationException $exception) {
            throw $exception;
        } catch (\InvalidArgumentException|\RuntimeException $exception) {
            return $this->errorResponse($exception->getMessage(), 422);
        }

        return $this->successResponse([
            'trans_no' => $transNo,
            'serial_numbers' => $serials,
        ], 'Opening stock serial numbers updated successfully.');
    }

    public function reorderAlerts()
    {
        return $this->successResponse(
            $this->stockService->getReorderAlerts(auth()->user()->BC),
            'Reorder alerts retrieved successfully.'
        );
    }

    public function batches($itemCode)
    {
        $batches = ItemBatch::where('item_code', $itemCode)
            ->where('BC', auth()->user()->BC)
            ->with('store')
            ->orderBy('batch_no')
            ->get();

        return $this->successResponse($batches);
    }

    public function movements(Request $request, $itemCode)
    {
        $movements = TItemMovement::where('item_code', $itemCode)
            ->where('BC', auth()->user()->BC)
            ->when($request->query('store_id'), function ($query, $storeId) {
                $query->where('store_id', $storeId);
            })
            ->with('store')
            ->orderBy('created_at', 'desc')
            ->paginate(50);

        $movementRows = collect($movements->items());
        $serials = TItemSerialMovement::query()
            ->where('item_code', $itemCode)
            ->where('bc', auth()->user()->BC)
            ->whereIn('trans_no', $movementRows->pluck('trans_no')->unique())
            ->whereIn('trans_code', $movementRows->pluck('trans_code')->unique())
            ->get()
            ->groupBy(fn (TItemSerialMovement $serial) => $serial->trans_no.'|'.$serial->trans_code.'|'.$serial->store_id);

        $movementRows->each(function (TItemMovement $movement) use ($serials) {
            $movement->setAttribute(
                'serial_numbers',
                $serials
                    ->get($movement->trans_no.'|'.$movement->trans_code.'|'.$movement->store_id, collect())
                    ->pluck('item_serial_no')
                    ->values()
                    ->all()
            );
        });

        return $this->paginatedResponse($movements);
    }
}
