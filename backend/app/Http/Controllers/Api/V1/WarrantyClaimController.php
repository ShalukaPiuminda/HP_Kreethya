<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\TWarrantyClaim;
use App\Services\WarrantyClaimService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class WarrantyClaimController extends BaseController
{
    public function __construct(private readonly WarrantyClaimService $warrantyClaimService)
    {
    }

    public function index(Request $request)
    {
        $filters = $request->validate([
            'status' => ['nullable', 'string', 'max:120'],
            'search' => ['nullable', 'string', 'max:100'],
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:100'],
        ]);

        return $this->paginatedResponse(
            $this->warrantyClaimService
                ->claims($filters, $request->user()->BC)
                ->paginate($filters['per_page'] ?? 25),
            'Warranty claims retrieved successfully.'
        );
    }

    public function lookup(Request $request)
    {
        $filters = $request->validate([
            'serial' => ['nullable', 'string', 'max:100', 'required_without:document_no'],
            'document_no' => ['nullable', 'string', 'max:50', 'required_without:serial'],
        ]);

        return $this->successResponse(
            $this->warrantyClaimService->lookup(
                $filters['serial'] ?? null,
                $filters['document_no'] ?? null,
                $request->user()->BC
            ),
            'Warranty lookup completed.'
        );
    }

    public function history(Request $request)
    {
        $filters = $request->validate([
            'source_type' => ['required', Rule::in(['invoice', 'hp'])],
            'source_detail_id' => ['required', 'integer'],
            'serial' => ['nullable', 'string', 'max:100'],
        ]);

        return $this->successResponse(
            $this->warrantyClaimService->history(
                $filters['source_type'],
                (int) $filters['source_detail_id'],
                $filters['serial'] ?? null,
                $request->user()->BC
            ),
            'Warranty history retrieved.'
        );
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'claim_date' => ['required', 'date'],
            'source_type' => ['required', Rule::in(['invoice', 'hp'])],
            'source_detail_id' => ['required', 'integer'],
            'item_serial_no' => ['nullable', 'string', 'max:100'],
            'qty' => ['nullable', 'integer', 'min:1'],
            'problem_description' => ['required', 'string', 'max:2000'],
            'intake_condition' => ['nullable', 'string', 'max:1000'],
            'accessories_received' => ['nullable', 'string', 'max:255'],
            'remarks' => ['nullable', 'string', 'max:1000'],
        ]);

        return $this->successResponse(
            $this->warrantyClaimService->receive($data, $request->user()),
            'Warranty claim received.',
            201
        );
    }

    public function show(Request $request, int $warrantyClaim)
    {
        return $this->successResponse(
            $this->warrantyClaimService->detail($this->findClaim($request, $warrantyClaim))
        );
    }

    public function decide(Request $request, int $warrantyClaim)
    {
        $branchCode = $request->user()->BC;
        $data = $request->validate([
            'decision_date' => ['required', 'date'],
            'resolution' => ['required', Rule::in(['repair', 'replace', 'refund', 'reject'])],
            'outcome_note' => ['nullable', 'string', 'max:2000', 'required_if:resolution,reject'],
            'replacement_store_id' => [
                'nullable',
                'integer',
                Rule::exists('stores', 'id')->where('BC', $branchCode),
            ],
            'replacement_serial_no' => ['nullable', 'string', 'max:100'],
            'replacement_batch_no' => ['nullable', 'string', 'max:50'],
            'refund_method' => ['nullable', Rule::in(['cash', 'bank_transfer', 'store_credit'])],
            'collected_by' => ['nullable', 'string', 'max:255'],
            'handover_note' => ['nullable', 'string', 'max:1000'],
        ]);

        return $this->successResponse(
            $this->warrantyClaimService->decide($this->findClaim($request, $warrantyClaim), $data, $request->user()),
            'Warranty decision recorded.'
        );
    }

    public function handover(Request $request, int $warrantyClaim)
    {
        $data = $request->validate([
            'delivered_date' => ['required', 'date'],
            'collected_by' => ['nullable', 'string', 'max:255'],
            'handover_note' => ['nullable', 'string', 'max:1000'],
        ]);

        return $this->successResponse(
            $this->warrantyClaimService->handover($this->findClaim($request, $warrantyClaim), $data, $request->user()),
            'Item handed over to the customer.'
        );
    }

    public function reject(Request $request, int $warrantyClaim)
    {
        $data = $request->validate([
            'reason' => ['required', 'string', 'max:1000'],
        ]);

        return $this->successResponse(
            $this->warrantyClaimService->rejectInRepair(
                $this->findClaim($request, $warrantyClaim),
                $data['reason'],
                $request->user()
            ),
            'Warranty claim rejected.'
        );
    }

    private function findClaim(Request $request, int $id): TWarrantyClaim
    {
        return TWarrantyClaim::query()
            ->where('BC', $request->user()->BC)
            ->whereKey($id)
            ->firstOrFail();
    }
}
