<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\PriceRevision;
use App\Services\PriceRevisionService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PriceRevisionController extends BaseController
{
    public function __construct(private PriceRevisionService $priceRevisionService)
    {
    }

    public function index(Request $request)
    {
        $branchCode = $request->user()->BC;

        $revisions = PriceRevision::query()
            ->where('BC', $branchCode)
            ->when($request->query('item_code'), fn ($query, $itemCode) => $query->where('item_code', $itemCode))
            ->when($request->query('batch_id'), fn ($query, $batchId) => $query->whereHas(
                'lines',
                fn ($lines) => $lines->where('item_batch_id', $batchId)
            ))
            ->when($request->query('source'), fn ($query, $source) => $query->where('source', $source))
            ->when($request->query('status'), fn ($query, $status) => $query->where('status', $status))
            ->when($request->query('changed_by'), fn ($query, $user) => $query->where('UID', 'like', "%{$user}%"))
            ->when($request->query('from'), fn ($query, $from) => $query->whereDate('created_at', '>=', $from))
            ->when($request->query('to'), fn ($query, $to) => $query->whereDate('created_at', '<=', $to))
            ->when($request->query('search'), function ($query, $search) {
                $query->where(function ($nested) use ($search) {
                    $nested->where('revision_no', 'like', "%{$search}%")
                        ->orWhere('item_code', 'like', "%{$search}%")
                        ->orWhere('reason', 'like', "%{$search}%")
                        ->orWhereHas('item', fn ($item) => $item->where('item_description', 'like', "%{$search}%"));
                });
            })
            ->with(['lines.store', 'item:id,item_code,item_description', 'store:id,name'])
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate(min((int) $request->query('per_page', 25), 100));

        return $this->paginatedResponse($revisions);
    }

    public function show(Request $request, int $id)
    {
        $revision = PriceRevision::where('BC', $request->user()->BC)
            ->with(['lines.store', 'item:id,item_code,item_description', 'store:id,name'])
            ->findOrFail($id);

        return $this->successResponse($revision);
    }

    public function preview(Request $request)
    {
        return $this->successResponse(
            $this->priceRevisionService->preview($this->validatePayload($request, false), $request->user())
        );
    }

    public function store(Request $request)
    {
        $revision = $this->priceRevisionService->create($this->validatePayload($request, true), $request->user());

        return $this->successResponse($revision, "Price revision {$revision->revision_no} saved.", 201);
    }

    public function reverse(Request $request, int $id)
    {
        $validated = $request->validate([
            'reason' => ['required', 'string', 'max:255'],
        ]);

        $revision = PriceRevision::where('BC', $request->user()->BC)->findOrFail($id);
        $reversal = $this->priceRevisionService->reverse($revision, $validated['reason'], $request->user());

        return $this->successResponse(
            $reversal,
            "{$revision->revision_no} reversed by {$reversal->revision_no}.",
            201
        );
    }

    private function validatePayload(Request $request, bool $requireReason): array
    {
        $branchCode = $request->user()->BC;
        $priceType = $request->input('price_type');
        $method = $request->input('method');
        // "Set" takes the new price itself; amount / percent may be negative to lower prices.
        $valueRules = fn (string $type) => [
            Rule::requiredIf(in_array($priceType, [$type, 'both'], true)),
            'nullable',
            'numeric',
            ...($method === 'set' ? ['min:0'] : []),
            ...($method === 'percent' ? ['min:-100', 'max:1000'] : []),
        ];

        return $request->validate([
            'item_code' => ['required', 'string', Rule::exists('items', 'item_code')->where('BC', $branchCode)],
            'scope' => ['required', Rule::in(PriceRevisionService::SCOPES)],
            'batch_ids' => ['required_if:scope,selected', 'array'],
            'batch_ids.*' => ['integer'],
            'store_id' => ['required_if:scope,store', 'nullable', 'integer', Rule::exists('stores', 'id')->where('BC', $branchCode)],
            'price_type' => ['required', Rule::in(PriceRevisionService::PRICE_TYPES)],
            'method' => ['required', Rule::in(PriceRevisionService::METHODS)],
            'sales_value' => $valueRules('sales'),
            'purchase_value' => $valueRules('purchase'),
            'update_standard' => ['sometimes', 'boolean'],
            'reason' => [$requireReason ? 'required' : 'nullable', 'string', 'max:255'],
        ]);
    }
}
