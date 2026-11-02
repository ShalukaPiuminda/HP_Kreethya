<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\StockAdjustment;
use App\Services\StockService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class StockAdjustmentController extends BaseController
{
    public function __construct(private StockService $stockService)
    {
    }

    public function index(Request $request)
    {
        $branchCode = $request->user()->BC;

        $adjustments = StockAdjustment::query()
            ->from('stock_adjustments as sa')
            ->leftJoin('items as i', function ($join) {
                $join->on('i.item_code', '=', 'sa.item_code')->on('i.BC', '=', 'sa.BC');
            })
            ->leftJoin('stores as s', 's.id', '=', 'sa.store_id')
            ->where('sa.BC', $branchCode)
            ->when($request->query('search'), function ($query, $search) {
                $query->where(function ($nested) use ($search) {
                    $nested->where('sa.item_code', 'like', "%{$search}%")
                        ->orWhere('i.item_description', 'like', "%{$search}%")
                        ->orWhere('sa.trans_no', 'like', "%{$search}%")
                        ->orWhere('sa.note', 'like', "%{$search}%");
                });
            })
            ->when($request->query('store_id'), fn ($query, $storeId) => $query->where('sa.store_id', $storeId))
            ->when($request->query('reason'), fn ($query, $reason) => $query->where('sa.reason', $reason))
            ->when($request->query('user'), fn ($query, $user) => $query->where('sa.UID', 'like', "%{$user}%"))
            ->when($request->query('from'), fn ($query, $from) => $query->whereDate('sa.created_at', '>=', $from))
            ->when($request->query('to'), fn ($query, $to) => $query->whereDate('sa.created_at', '<=', $to))
            ->select('sa.*', 'i.item_description', 's.name as store_name')
            ->orderByDesc('sa.created_at')
            ->orderByDesc('sa.id')
            ->paginate(min((int) $request->query('per_page', 25), 100));

        return $this->paginatedResponse($adjustments, 'Stock adjustments retrieved successfully.');
    }

    public function store(Request $request)
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
            'batch_no' => ['nullable', 'string', 'max:50'],
            'current_qty' => ['required', 'integer'],
            'new_qty' => ['required', 'integer', 'min:0'],
            'reason' => ['required', 'string', Rule::in(StockAdjustment::REASONS)],
            'note' => ['required', 'string', 'min:5', 'max:1000'],
            'serial_numbers' => ['nullable', 'array'],
            'serial_numbers.*' => ['required', 'string', 'max:100', 'distinct'],
        ]);

        $transNo = $this->stockService->generateTransNo('ADJ', $branchCode);

        try {
            $adjustment = $this->stockService->adjustStock(
                $transNo,
                $validated['item_code'],
                (int) $validated['store_id'],
                $validated['batch_no'] ?? null,
                (int) $validated['new_qty'],
                (int) $validated['current_qty'],
                $validated['reason'],
                trim($validated['note']),
                $validated['serial_numbers'] ?? null,
                $branchCode,
                $request->user()->username
            );
        } catch (\InvalidArgumentException|\RuntimeException $e) {
            return $this->errorResponse($e->getMessage(), 422);
        }

        return $this->successResponse($adjustment, 'Stock adjusted successfully.', 201);
    }
}
