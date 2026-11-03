<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\TPurchasesDetail;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class BarcodePrintController extends BaseController
{
    /** GRN lines with their barcode print status, newest GRN first. */
    public function index(Request $request)
    {
        $request->validate([
            'status' => ['nullable', Rule::in(['pending', 'printed', 'all'])],
        ]);

        $branchCode = $request->user()->BC;
        $filtered = TPurchasesDetail::query()
            ->where('BC', $branchCode)
            ->when($request->query('search'), function ($query, string $search) {
                $query->where(function ($nested) use ($search) {
                    $nested->where('Invoice_no', 'like', "%{$search}%")
                        ->orWhere('Item_code', 'like', "%{$search}%")
                        ->orWhere('Item_description', 'like', "%{$search}%")
                        ->orWhereHas('purchase.supplier', function ($supplierQuery) use ($search) {
                            $supplierQuery->where('name', 'like', "%{$search}%");
                        });
                });
            })
            ->when($request->query('supplier_code'), function ($query, string $supplierCode) {
                $query->whereHas('purchase', fn ($purchaseQuery) => $purchaseQuery->where('supplier_code', $supplierCode));
            })
            ->when($request->query('date_from'), fn ($query, string $date) => $query->whereDate('Invoice_date', '>=', $date))
            ->when($request->query('date_to'), fn ($query, string $date) => $query->whereDate('Invoice_date', '<=', $date));

        $counts = [
            'pending' => (clone $filtered)->whereNull('barcode_printed_at')->count(),
            'printed' => (clone $filtered)->whereNotNull('barcode_printed_at')->count(),
        ];

        $lines = $filtered
            ->when($request->query('status', 'pending'), function ($query, string $status) {
                if ($status === 'pending') $query->whereNull('barcode_printed_at');
                if ($status === 'printed') $query->whereNotNull('barcode_printed_at');
            })
            ->with(['purchase:id,Invoice_no,Invoice_date,supplier_code', 'purchase.supplier', 'item'])
            ->orderByDesc('Invoice_date')
            ->orderByDesc('id')
            ->paginate(min(max((int) $request->integer('per_page', 50), 1), 200));

        return response()->json([
            'success' => true,
            'message' => 'Barcode print lines retrieved successfully.',
            'data' => $lines->items(),
            'meta' => [
                'current_page' => $lines->currentPage(),
                'last_page' => $lines->lastPage(),
                'per_page' => $lines->perPage(),
                'total' => $lines->total(),
                'counts' => $counts,
            ],
        ]);
    }

    /** Records a confirmed label print for each GRN line. */
    public function markPrinted(Request $request)
    {
        $validated = $request->validate([
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.detail_id' => ['required', 'integer', 'distinct'],
            'lines.*.labels' => ['required', 'integer', 'min:0'],
        ]);

        $user = $request->user();
        $labelsById = collect($validated['lines'])->pluck('labels', 'detail_id');

        $updated = DB::transaction(function () use ($labelsById, $user) {
            $details = TPurchasesDetail::query()
                ->where('BC', $user->BC)
                ->whereIn('id', $labelsById->keys())
                ->lockForUpdate()
                ->get();

            foreach ($details as $detail) {
                $detail->update([
                    'barcode_printed_at' => now(),
                    'barcode_printed_qty' => (int) $labelsById[$detail->id],
                    'barcode_print_count' => $detail->barcode_print_count + 1,
                    'barcode_printed_by' => $user->username,
                ]);
            }

            return $details->count();
        });

        return $this->successResponse(['updated' => $updated], 'Barcode labels marked as printed.');
    }

    /** Puts GRN lines back to "not printed" (e.g. a print was confirmed by mistake). */
    public function markUnprinted(Request $request)
    {
        $validated = $request->validate([
            'detail_ids' => ['required', 'array', 'min:1'],
            'detail_ids.*' => ['required', 'integer'],
        ]);

        $updated = TPurchasesDetail::query()
            ->where('BC', $request->user()->BC)
            ->whereIn('id', $validated['detail_ids'])
            ->update(['barcode_printed_at' => null, 'barcode_printed_qty' => 0]);

        return $this->successResponse(['updated' => $updated], 'Barcode labels marked as not printed.');
    }
}
