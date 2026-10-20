<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\TSalesReturnSum;
use App\Services\SalesService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SalesReturnController extends BaseController
{
    public function __construct(private readonly SalesService $salesService)
    {
    }

    public function index(Request $request)
    {
        $returns = TSalesReturnSum::query()
            ->where('BC', $request->user()->BC)
            ->with(['invoice.customer', 'reason', 'store', 'details.item'])
            ->when($request->query('search'), function ($query, string $search) {
                $query->where(function ($nested) use ($search) {
                    $nested->where('return_no', 'like', "%{$search}%")
                        ->orWhere('invoice_no', 'like', "%{$search}%")
                        ->orWhere('customer_nic', 'like', "%{$search}%");
                });
            })
            ->orderByDesc('return_date')
            ->orderByDesc('id')
            ->paginate(min(max((int) $request->integer('per_page', 25), 1), 100));

        return $this->paginatedResponse($returns, 'Sales returns retrieved successfully.');
    }

    public function store(Request $request)
    {
        $return = $this->salesService->createReturn(
            $this->validateReturn($request),
            $request->user()
        );

        return $this->successResponse($return, 'Sales return posted successfully.', 201);
    }

    public function show(Request $request, int $salesReturn)
    {
        $return = TSalesReturnSum::query()
            ->whereKey($salesReturn)
            ->where('BC', $request->user()->BC)
            ->with(['invoice.customer', 'reason', 'store', 'details.item'])
            ->firstOrFail();

        return $this->successResponse($return);
    }

    private function validateReturn(Request $request): array
    {
        $branchCode = $request->user()->BC;

        return $request->validate([
            'return_date' => ['required', 'date'],
            'invoice_no' => [
                'required',
                'string',
                Rule::exists('t_invoice_sums', 'Invoice_no')->where('BC', $branchCode),
            ],
            'reason_id' => [
                'required',
                'integer',
                Rule::exists('sales_return_reasons', 'id')->where('BC', $branchCode),
            ],
            'refund_method' => ['nullable', Rule::in(['cash', 'bank_transfer', 'store_credit'])],
            'items' => ['required', 'array', 'min:1'],
            'items.*.invoice_detail_id' => ['required', 'integer', 'distinct', 'exists:t_invoice_deils,id'],
            'items.*.qty' => ['required', 'integer', 'min:1'],
            'items.*.serial_numbers' => ['nullable', 'array'],
            'items.*.serial_numbers.*' => ['required', 'string', 'max:100', 'distinct'],
        ]);
    }
}
