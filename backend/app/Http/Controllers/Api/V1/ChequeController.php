<?php

namespace App\Http\Controllers\Api\V1;

use App\Services\ChequeService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ChequeController extends BaseController
{
    public function __construct(private readonly ChequeService $chequeService)
    {
    }

    public function summary(Request $request)
    {
        return $this->successResponse(
            $this->chequeService->summary($request->user()->BC),
            'Cheque summary retrieved successfully.'
        );
    }

    public function customerIndex(Request $request)
    {
        $filters = $this->validateFilters($request);

        return $this->paginatedResponse(
            $this->chequeService->customerCheques($filters, $request->user()->BC),
            'Customer cheques retrieved successfully.'
        );
    }

    public function supplierIndex(Request $request)
    {
        $filters = $this->validateFilters($request);

        return $this->paginatedResponse(
            $this->chequeService->supplierCheques($filters, $request->user()->BC),
            'Supplier cheques retrieved successfully.'
        );
    }

    public function passCustomer(Request $request, int $cheque)
    {
        $validated = $this->validatePass($request);

        return $this->successResponse(
            $this->chequeService->passCustomerCheque(
                $cheque,
                $validated['action_date'],
                $validated['bank_detail_id'],
                $request->user()
            ),
            'Customer cheque cleared successfully.'
        );
    }

    public function returnCustomer(Request $request, int $cheque)
    {
        $validated = $this->validateReturn($request);

        return $this->successResponse(
            $this->chequeService->returnCustomerCheque(
                $cheque,
                $validated['action_date'],
                $validated['reason'],
                $request->user()
            ),
            'Customer cheque returned and customer debt restored.'
        );
    }

    public function passSupplier(Request $request, int $cheque)
    {
        $validated = $this->validatePass($request);

        return $this->successResponse(
            $this->chequeService->passSupplierCheque(
                $cheque,
                $validated['action_date'],
                $validated['bank_detail_id'],
                $request->user()
            ),
            'Supplier cheque cleared successfully.'
        );
    }

    public function returnSupplier(Request $request, int $cheque)
    {
        $validated = $this->validateReturn($request);

        return $this->successResponse(
            $this->chequeService->returnSupplierCheque(
                $cheque,
                $validated['action_date'],
                $validated['reason'],
                $request->user()
            ),
            'Supplier cheque returned and supplier payable restored.'
        );
    }

    private function validateFilters(Request $request): array
    {
        return $request->validate([
            'status' => ['nullable', Rule::in(['pending', 'passed', 'returned'])],
            'search' => ['nullable', 'string', 'max:100'],
            'date_from' => ['nullable', 'date'],
            'date_to' => ['nullable', 'date', 'after_or_equal:date_from'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);
    }

    private function validatePass(Request $request): array
    {
        return $request->validate([
            'action_date' => ['required', 'date'],
            'bank_detail_id' => [
                'required',
                'integer',
                Rule::exists('bank_details', 'id')->where('BC', $request->user()->BC),
            ],
        ]);
    }

    private function validateReturn(Request $request): array
    {
        return $request->validate([
            'action_date' => ['required', 'date'],
            'reason' => ['required', 'string', 'max:1000'],
        ]);
    }
}
