<?php

namespace App\Http\Controllers\Api\HpApi;

use App\Http\Controllers\Api\V1\BaseController;
use App\Services\ReportingService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ReportRowsController extends BaseController
{
    public function __construct(private readonly ReportingService $reportingService)
    {
    }

    public function index(Request $request)
    {
        $validated = $request->validate([
            'category' => ['required', Rule::in(['sales', 'purchases', 'collections', 'hp_collections', 'overdue'])],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
        ]);
        $from = $validated['from'] ?? now()->startOfMonth()->format('Y-m-d');
        $to = $validated['to'] ?? now()->format('Y-m-d');

        $rows = $this->reportingService->reportRows($request->user(), $validated['category'], $from, $to);

        return $this->successResponse(['rows' => $rows]);
    }

    public function detail(Request $request)
    {
        $validated = $request->validate([
            'type' => ['required', Rule::in(['sale', 'purchase', 'collection', 'hp_collection'])],
            'id' => ['required', 'string', 'max:100'],
            'source' => ['nullable', Rule::in(['customer', 'service'])],
        ]);
        $record = $this->reportingService->transactionDetail($request->user(), $validated['type'], $validated['id'], $validated['source'] ?? null);
        abort_if(!$record, 404, 'Transaction not found.');
        return $this->successResponse(['record' => $record]);
    }

    public function recent(Request $request)
    {
        $validated = $request->validate([
            'type' => ['nullable', Rule::in(['all', 'sale', 'purchase', 'collection', 'hp_collection'])],
            'limit' => ['nullable', 'integer', 'min:1', 'max:50'],
        ]);

        $rows = $this->reportingService->recentTransactions(
            $request->user(),
            $validated['type'] ?? null,
            (int) ($validated['limit'] ?? 10)
        );

        return $this->successResponse(['rows' => $rows]);
    }
}
