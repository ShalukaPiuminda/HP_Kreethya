<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\BranchDel;
use App\Models\Company;
use App\Models\RolePermission;
use App\Models\SerialWarranty;
use App\Models\Store;
use App\Models\WarrantyClaim;
use App\Services\StockService;
use App\Services\WarrantyClaimService;
use App\Services\WarrantyService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class WarrantyClaimController extends BaseController
{
    public function __construct(
        private readonly WarrantyClaimService $claimService,
        private readonly WarrantyService $warrantyService,
        private readonly StockService $stockService
    ) {}

    public function index(Request $request): JsonResponse
    {
        $branchCode = $request->user()->BC;

        $claims = WarrantyClaim::query()
            ->from('warranty_claims as wc')
            ->leftJoin('items as i', function ($join) {
                $join->on('i.item_code', '=', 'wc.item_code')->on('i.BC', '=', 'wc.BC');
            })
            ->leftJoin('suppliers as s', function ($join) {
                $join->on('s.Code', '=', 'wc.supplier_code')->on('s.BC', '=', 'wc.BC');
            })
            ->where('wc.BC', $branchCode)
            ->when($request->query('search'), function ($query, $search) {
                $query->where(function ($nested) use ($search) {
                    $nested->where('wc.claim_no', 'like', "%{$search}%")
                        ->orWhere('wc.item_serial_no', 'like', "%{$search}%")
                        ->orWhere('wc.item_code', 'like', "%{$search}%")
                        ->orWhere('i.item_description', 'like', "%{$search}%")
                        ->orWhere('wc.customer_name', 'like', "%{$search}%")
                        ->orWhere('wc.customer_phone', 'like', "%{$search}%")
                        ->orWhere('wc.sale_no', 'like', "%{$search}%");
                });
            })
            ->when($request->query('status'), function ($query, $status) {
                $status === 'open'
                    ? $query->whereIn('wc.status', WarrantyClaimService::OPEN_STATUSES)
                    : $query->where('wc.status', $status);
            })
            ->when($request->query('from'), fn ($query, $from) => $query->whereDate('wc.claim_date', '>=', $from))
            ->when($request->query('to'), fn ($query, $to) => $query->whereDate('wc.claim_date', '<=', $to))
            ->select('wc.*', 'i.item_description', 's.name as supplier_name')
            // Other claims on the same unit: same serial, or the same invoice line for non-serial items.
            ->selectSub(function ($query) {
                $query->from('warranty_claims as other')
                    ->selectRaw('COUNT(*)')
                    ->whereColumn('other.BC', 'wc.BC')
                    ->whereColumn('other.item_code', 'wc.item_code')
                    ->whereColumn('other.id', '!=', 'wc.id')
                    ->where(function ($match) {
                        $match->where(function ($serial) {
                            $serial->whereNotNull('wc.item_serial_no')
                                ->whereColumn('other.item_serial_no', 'wc.item_serial_no');
                        })->orWhere(function ($line) {
                            $line->whereNull('wc.item_serial_no')
                                ->whereNotNull('wc.serial_warranty_id')
                                ->whereColumn('other.serial_warranty_id', 'wc.serial_warranty_id');
                        });
                    });
            }, 'previous_claims_count')
            ->orderByDesc('wc.claim_date')
            ->orderByDesc('wc.id')
            ->paginate(min((int) $request->query('per_page', 25), 100));

        return $this->paginatedResponse($claims, 'Warranty claims retrieved successfully.');
    }

    public function summary(Request $request): JsonResponse
    {
        $counts = WarrantyClaim::query()
            ->where('BC', $request->user()->BC)
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        $overdue = WarrantyClaim::query()
            ->where('BC', $request->user()->BC)
            ->where('status', 'sent_to_supplier')
            ->whereDate('sent_date', '<', now()->subDays(30))
            ->count();

        return $this->successResponse([
            'open' => (int) collect(WarrantyClaimService::OPEN_STATUSES)->sum(fn ($status) => $counts[$status] ?? 0),
            'at_supplier' => (int) ($counts['sent_to_supplier'] ?? 0),
            'in_service' => (int) ($counts['in_service'] ?? 0),
            'cancelled' => (int) ($counts['cancelled'] ?? 0),
            'awaiting_close' => (int) collect(['repaired', 'replaced', 'rejected'])->sum(fn ($status) => $counts[$status] ?? 0),
            'closed' => (int) ($counts['closed'] ?? 0),
            'overdue_at_supplier' => $overdue,
        ], 'Warranty claim summary retrieved successfully.');
    }

    public function lookup(Request $request, string $serial): JsonResponse
    {
        $units = $this->warrantyService->lookup($serial, $request->user()->BC);

        if (empty($units)) {
            return $this->errorResponse("Serial number {$serial} was not found.", 404);
        }

        return $this->successResponse($units, 'Serial details retrieved successfully.');
    }

    public function lookupInvoice(Request $request, string $invoice): JsonResponse
    {
        $units = $this->warrantyService->lookupInvoice($invoice, $request->user()->BC);

        if (empty($units)) {
            return $this->errorResponse("No warranty items were found on invoice {$invoice}.", 404);
        }

        return $this->successResponse($units, 'Invoice warranty details retrieved successfully.');
    }

    public function cancelWarranty(Request $request, int $warrantyId): JsonResponse
    {
        $validated = $request->validate([
            'reason' => ['required', 'string', 'min:3', 'max:1000'],
        ]);

        $warranty = $this->warrantyService->cancel(
            $this->findWarranty($request, $warrantyId),
            $validated['reason'],
            $request->user()->username
        );

        return $this->successResponse($warranty, 'Warranty cancelled successfully.');
    }

    public function restoreWarranty(Request $request, int $warrantyId): JsonResponse
    {
        $warranty = $this->warrantyService->restore(
            $this->findWarranty($request, $warrantyId),
            $request->user()->username
        );

        return $this->successResponse($warranty, 'Warranty restored successfully.');
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $claim = $this->findClaim($request, $id);

        return $this->successResponse($this->claimService->load($claim), 'Warranty claim retrieved successfully.');
    }

    /**
     * Stores, in-stock serials and batches of the claimed item, for picking a replacement unit.
     */
    public function replacementOptions(Request $request, int $id): JsonResponse
    {
        $claim = $this->findClaim($request, $id);
        $branchCode = $request->user()->BC;

        $stock = collect($this->stockService->getInventorySnapshot($branchCode, $claim->item_code))
            ->firstWhere('item_code', $claim->item_code);

        return $this->successResponse([
            'stores' => Store::query()->where('BC', $branchCode)->orderBy('name')->get(['id', 'name']),
            'is_batch' => (bool) ($stock['is_batch'] ?? false),
            'is_serialized' => (bool) ($stock['is_serialized'] ?? false),
            'qty' => (int) $claim->qty,
            'store_qty' => collect($stock['stores'] ?? [])
                ->map(fn (array $store) => ['store_id' => $store['store_id'], 'qty_in_hand' => $store['qty_in_hand']])
                ->values(),
            'available_serials' => collect($stock['available_serials'] ?? [])
                ->reject(fn (array $serial) => $serial['serial_no'] === $claim->item_serial_no)
                ->values(),
            'batches' => collect($stock['batches'] ?? [])
                ->filter(fn (array $batch) => $batch['qty_in_hand'] > 0)
                ->map(fn (array $batch) => [
                    'batch_no' => $batch['batch_no'],
                    'store_id' => $batch['store_id'],
                    'qty_in_hand' => $batch['qty_in_hand'],
                ])
                ->values(),
        ], 'Replacement options retrieved successfully.');
    }

    public function store(Request $request): JsonResponse
    {
        $branchCode = $request->user()->BC;
        $validated = $request->validate([
            'claim_date' => ['required', 'date'],
            'item_code' => ['required', 'string', Rule::exists('items', 'item_code')->where('BC', $branchCode)],
            'item_serial_no' => ['nullable', 'required_without:serial_warranty_id', 'string', 'max:100'],
            'serial_warranty_id' => ['nullable', 'required_without:item_serial_no', 'integer'],
            'qty' => ['nullable', 'integer', 'min:1'],
            'customer_code' => ['nullable', 'string', 'max:50'],
            'customer_name' => ['nullable', 'string', 'max:150'],
            'customer_phone' => ['nullable', 'string', 'max:50'],
            'fault_description' => ['required', 'string', 'min:3', 'max:2000'],
            'accessories_received' => ['nullable', 'string', 'max:255'],
            'remarks' => ['nullable', 'string', 'max:2000'],
        ]);

        $claim = $this->claimService->create($validated, $request->user());

        return $this->successResponse($claim, 'Warranty claim created successfully.', 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $claim = $this->findClaim($request, $id);
        $validated = $request->validate([
            'customer_name' => ['nullable', 'string', 'max:150'],
            'customer_phone' => ['nullable', 'string', 'max:50'],
            'fault_description' => ['sometimes', 'required', 'string', 'min:3', 'max:2000'],
            'accessories_received' => ['nullable', 'string', 'max:255'],
            'supplier_ref_no' => ['nullable', 'string', 'max:50'],
            'remarks' => ['nullable', 'string', 'max:2000'],
        ]);

        $claim = $this->claimService->update($claim, $validated, $request->user());

        return $this->successResponse($claim, 'Warranty claim updated successfully.');
    }

    public function changeStatus(Request $request, int $id): JsonResponse
    {
        $branchCode = $request->user()->BC;
        $claim = $this->findClaim($request, $id);
        $validated = $request->validate([
            'status' => ['required', Rule::in(WarrantyClaimService::STATUSES)],
            'action_date' => ['nullable', 'date'],
            'supplier_ref_no' => ['nullable', 'string', 'max:50'],
            'replacement_serial_no' => ['nullable', 'string', 'max:100'],
            'store_id' => ['nullable', 'integer', Rule::exists('stores', 'id')->where('BC', $branchCode)],
            'batch_no' => ['nullable', 'string', 'max:50'],
            'receive_faulty' => ['sometimes', 'boolean'],
            'note' => ['nullable', 'string', 'max:1000'],
            'remarks' => ['nullable', 'string', 'max:2000'],
            'handed_over_at' => ['nullable', 'date'],
            'handed_over_to' => ['nullable', 'required_if:status,closed', 'string', 'min:2', 'max:150'],
            'handed_over_nic' => ['nullable', 'string', 'max:20'],
            'handover_note' => ['nullable', 'string', 'max:2000'],
        ]);

        $claim = $this->claimService->changeStatus($claim, $validated, $request->user());

        return $this->successResponse($claim, 'Warranty claim updated successfully.');
    }

    public function sendToService(Request $request, int $id): JsonResponse
    {
        $user = $request->user();

        // The claim user also needs rights to create service tickets.
        if (! $user->isSuperAdmin()) {
            $canCreateService = RolePermission::query()
                ->where('role_id', $user->role_id)
                ->where('module', 'service')
                ->value('can_create');

            if (! $canCreateService) {
                return $this->errorResponse('You need permission to create service tickets.', 403);
            }
        }

        $validated = $request->validate([
            'customer_code' => ['nullable', 'string', Rule::exists('customers', 'Code')->where('BC', $user->BC)],
            'action_date' => ['nullable', 'date'],
            'expected_completion_date' => ['nullable', 'date'],
            'note' => ['nullable', 'string', 'max:1000'],
        ]);

        $claim = $this->claimService->sendToService($this->findClaim($request, $id), $validated, $user);

        return $this->successResponse($claim, "Service ticket {$claim->service_ticket_no} created.");
    }

    public function printData(Request $request, int $id): JsonResponse
    {
        $claim = $this->claimService->load($this->findClaim($request, $id));

        return $this->successResponse([
            'claim' => $claim,
            'company' => Company::query()->orderBy('id')->first(),
            'branch' => BranchDel::query()->where('bccode', $claim->BC)->first(),
        ]);
    }

    private function findWarranty(Request $request, int $id): SerialWarranty
    {
        return SerialWarranty::query()
            ->whereKey($id)
            ->where('BC', $request->user()->BC)
            ->lockForUpdate()
            ->firstOrFail();
    }

    private function findClaim(Request $request, int $id): WarrantyClaim
    {
        return WarrantyClaim::query()
            ->whereKey($id)
            ->where('BC', $request->user()->BC)
            ->firstOrFail();
    }
}
