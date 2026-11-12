<?php

namespace App\Http\Controllers\Api\HpApi;

use App\Http\Controllers\Api\V1\BaseController;
use App\Services\ReportingService;
use Carbon\Carbon;
use Illuminate\Http\Request;

class DashboardChartsController extends BaseController
{
    public function __construct(private readonly ReportingService $reportingService)
    {
    }

    public function index(Request $request)
    {
        $validated = $request->validate([
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
        ]);
        $from = $validated['from'] ?? Carbon::today()->startOfMonth()->format('Y-m-d');
        $to = $validated['to'] ?? Carbon::today()->format('Y-m-d');

        return $this->successResponse($this->reportingService->dashboardCharts($request->user(), $from, $to));
    }
}
