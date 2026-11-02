<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\DayEndBalance;
use App\Services\ReportingService;
use Carbon\Carbon;
use Illuminate\Http\Request;

class ReportingController extends BaseController
{
    public function __construct(private readonly ReportingService $reportingService)
    {
    }

    public function options(Request $request)
    {
        return $this->successResponse($this->reportingService->options($request->user()));
    }

    public function overview(Request $request)
    {
        [$from, $to] = $this->dates($request);
        return $this->successResponse($this->reportingService->overview($request->user(), $from, $to));
    }

    public function trialBalance(Request $request)
    {
        $to = $request->validate(['to' => ['nullable', 'date']])['to'] ?? today()->format('Y-m-d');
        return $this->successResponse($this->reportingService->trialBalance($request->user(), $to));
    }

    public function dayEnds(Request $request)
    {
        $rows = DayEndBalance::query()
            ->where('BC', $request->user()->BC)
            ->with('closedBy:id,username')
            ->orderByDesc('close_date')
            ->paginate(100);
        return $this->paginatedResponse($rows);
    }

    public function stockInHand(Request $request)
    {
        $validated = $request->validate([
            'search' => ['nullable', 'string', 'max:100'],
            'item_code' => ['nullable', 'string', 'max:50'],
            'store_id' => ['nullable', 'integer'],
        ]);

        return $this->successResponse($this->reportingService->stockInHand($request->user(), $validated));
    }

    public function binCard(Request $request)
    {
        $validated = $request->validate([
            'item_code' => ['required', 'string', 'max:50'],
            'store_id' => ['nullable', 'integer'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
        ]);

        return $this->successResponse($this->reportingService->binCard($request->user(), $validated));
    }

    public function purchases(Request $request)
    {
        $validated = $request->validate([
            'mode' => ['nullable', 'in:summary,detail'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'store_id' => ['nullable', 'integer'],
            'supplier_code' => ['nullable', 'string', 'max:50'],
            'item_code' => ['nullable', 'string', 'max:50'],
            'search' => ['nullable', 'string', 'max:100'],
        ]);

        return $this->successResponse($this->reportingService->purchases($request->user(), $validated));
    }

    public function sales(Request $request)
    {
        $validated = $request->validate([
            'mode' => ['nullable', 'in:summary,detail'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'store_id' => ['nullable', 'integer'],
            'customer_code' => ['nullable', 'string', 'max:50'],
            'item_code' => ['nullable', 'string', 'max:50'],
            'search' => ['nullable', 'string', 'max:100'],
        ]);

        return $this->successResponse($this->reportingService->sales($request->user(), $validated));
    }

    public function hirePurchase(Request $request)
    {
        $validated = $request->validate([
            'mode' => ['nullable', 'in:summary,detail'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'store_id' => ['nullable', 'integer'],
            'customer_code' => ['nullable', 'string', 'max:50'],
            'item_code' => ['nullable', 'string', 'max:50'],
            'status' => ['nullable', 'string', 'max:30'],
            'search' => ['nullable', 'string', 'max:100'],
        ]);

        return $this->successResponse($this->reportingService->hirePurchase($request->user(), $validated));
    }

    public function cashFlow(Request $request)
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'account_code' => ['nullable', 'string', 'max:20'],
        ]);

        return $this->successResponse($this->reportingService->cashFlow($request->user(), $validated));
    }

    public function dayEndPreview(Request $request)
    {
        $date = $request->validate(['date' => ['required', 'date']])['date'];
        return $this->successResponse($this->reportingService->dayEndPreview($request->user(), $date));
    }

    public function closeDay(Request $request)
    {
        $validated = $request->validate([
            'close_date' => ['required', 'date'],
            'counted_cash' => ['required', 'numeric'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);
        return $this->successResponse(
            $this->reportingService->closeDay($request->user(), $validated),
            'Business day closed.',
            201
        );
    }

    private function dates(Request $request): array
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
        ]);
        return [
            $validated['from'] ?? Carbon::today()->startOfMonth()->format('Y-m-d'),
            $validated['to'] ?? Carbon::today()->format('Y-m-d'),
        ];
    }
}
