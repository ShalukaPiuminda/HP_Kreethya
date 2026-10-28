<?php

namespace App\Services;

use App\Models\BranchDel;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Item;
use App\Models\SalesReturnReason;
use App\Models\THirePurchaseDetail;
use App\Models\THirePurchaseSum;
use App\Models\TInvoiceDeil;
use App\Models\TInvoiceSum;
use App\Models\TSalesReturnDetail;
use App\Models\TServiceReturn;
use App\Models\TWarrantyClaim;
use App\Models\TWarrantyClaimEvent;
use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Warranty claim workflow:
 *   receive -> received -> decide: repair  -> in_repair -> (ticket repaired) -> ready_for_pickup -> handover -> delivered
 *                                 replace -> delivered (new unit handed over at once)
 *                                 refund  -> refunded
 *                                 reject  -> ready_for_pickup -> handover -> delivered
 *   in_repair -> reject -> rejected (ticket continues as a paid service job)
 *
 * While a claim is received / in repair / ready for pickup the unit is with us and
 * cannot be claimed again. The customer is never charged for a warranty claim.
 */
class WarrantyClaimService
{
    public const CUSTODY_STATUSES = ['received', 'in_repair', 'ready_for_pickup'];

    public function __construct(
        private readonly StockService $stockService,
        private readonly SalesService $salesService,
        private readonly ServiceTicketService $serviceTicketService
    ) {}

    /**
     * Sold units matching a serial number or an invoice / HP agreement number, each
     * flagged eligible or not (with the reason) for a warranty claim.
     */
    public function lookup(?string $serial, ?string $documentNo, string $branchCode): array
    {
        $serial = trim((string) $serial);
        $documentNo = trim((string) $documentNo);
        $candidates = collect();

        if ($serial !== '') {
            $soldSerial = $this->originalSoldSerial($serial, $branchCode);

            TInvoiceDeil::query()
                ->where('BC', $branchCode)
                ->whereJsonContains('serial_numbers', $soldSerial)
                ->with(['sum', 'item'])
                ->get()
                ->each(fn (TInvoiceDeil $detail) => $candidates->push(
                    $this->candidate('invoice', $detail, $soldSerial, $branchCode)
                ));

            THirePurchaseDetail::query()
                ->where('BC', $branchCode)
                ->whereJsonContains('serial_numbers', $soldSerial)
                ->with(['sum', 'item'])
                ->get()
                ->each(fn (THirePurchaseDetail $detail) => $candidates->push(
                    $this->candidate('hp', $detail, $soldSerial, $branchCode)
                ));
        } elseif ($documentNo !== '') {
            $invoice = TInvoiceSum::query()
                ->where('BC', $branchCode)
                ->where('Invoice_no', $documentNo)
                ->with('details.item')
                ->first();

            if ($invoice) {
                $candidates = $candidates->merge($this->candidatesForLines('invoice', $invoice->details, $invoice, $branchCode));
            }

            $agreement = THirePurchaseSum::query()
                ->where('BC', $branchCode)
                ->where(fn ($query) => $query->where('invoice_no', $documentNo)->orWhere('agreement_no', $documentNo))
                ->with('details.item')
                ->first();

            if ($agreement) {
                $candidates = $candidates->merge($this->candidatesForLines('hp', $agreement->details, $agreement, $branchCode));
            }
        }

        return $candidates->values()->all();
    }

    public function claims(array $filters, string $branchCode)
    {
        return TWarrantyClaim::query()
            ->where('BC', $branchCode)
            ->when($filters['status'] ?? null, fn ($query, string $status) => $query->whereIn('status', explode(',', $status)))
            ->when($filters['from'] ?? null, fn ($query, string $from) => $query->whereDate('claim_date', '>=', $from))
            ->when($filters['to'] ?? null, fn ($query, string $to) => $query->whereDate('claim_date', '<=', $to))
            ->when($filters['search'] ?? null, function ($query, string $search) {
                $query->where(function ($nested) use ($search) {
                    $nested->where('claim_no', 'like', "%{$search}%")
                        ->orWhere('invoice_no', 'like', "%{$search}%")
                        ->orWhere('agreement_no', 'like', "%{$search}%")
                        ->orWhere('item_serial_no', 'like', "%{$search}%")
                        ->orWhere('replacement_serial_no', 'like', "%{$search}%")
                        ->orWhere('service_ticket_no', 'like', "%{$search}%")
                        ->orWhere('item_code', 'like', "%{$search}%")
                        ->orWhere('customer_name', 'like', "%{$search}%");
                });
            })
            ->with(['store', 'serviceTicket'])
            ->orderByDesc('claim_date')
            ->orderByDesc('id');
    }

    /** Claim with its timeline, service work, and the unit's full warranty history. */
    public function detail(TWarrantyClaim $claim): array
    {
        $claim->load(['store', 'events', 'serviceTicket.issues', 'serviceTicket.dispatches.supplier']);

        return [
            'claim' => $claim,
            'company' => Company::query()->orderBy('id')->first(),
            'branch' => BranchDel::query()->where('bccode', $claim->BC)->first(),
            'customer' => Customer::query()
                ->where('BC', $claim->BC)
                ->where('Code', $claim->customer_code)
                ->first(['Code', 'name', 'phone', 'address', 'NIC']),
            'history' => $this->history(
                $claim->source_type,
                $claim->source_detail_id,
                $claim->item_serial_no,
                $claim->BC
            ),
        ];
    }

    /** Step 1: the customer hands the unit in. No decision yet; the unit is now with us. */
    public function receive(array $data, User $user): TWarrantyClaim
    {
        return DB::transaction(function () use ($data, $user) {
            $candidate = $this->candidateFor(
                $data['source_type'],
                (int) $data['source_detail_id'],
                $data['item_serial_no'] ?? null,
                $user->BC
            );

            if (! $candidate) {
                throw ValidationException::withMessages([
                    'source_detail_id' => 'The selected sold item was not found.',
                ]);
            }

            if (! $candidate['eligible']) {
                throw ValidationException::withMessages([
                    'source_detail_id' => $candidate['reason'],
                ]);
            }

            $qty = $candidate['item_serial_no'] ? 1 : (int) ($data['qty'] ?? 1);
            if ($qty < 1 || $qty > $candidate['claimable_qty']) {
                throw ValidationException::withMessages([
                    'qty' => "Only {$candidate['claimable_qty']} units can be claimed on this line.",
                ]);
            }

            $claim = TWarrantyClaim::create([
                'claim_no' => $this->nextNumber($user->BC),
                'claim_date' => $data['claim_date'],
                'source_type' => $candidate['source_type'],
                'invoice_no' => $candidate['invoice_no'],
                'agreement_no' => $candidate['agreement_no'],
                'source_detail_id' => $candidate['source_detail_id'],
                'customer_code' => $candidate['customer_code'],
                'customer_name' => $candidate['customer_name'],
                'item_code' => $candidate['item_code'],
                'item_description' => $candidate['item_description'],
                'sold_serial_no' => $candidate['sold_serial_no'],
                'item_serial_no' => $candidate['item_serial_no'],
                'qty' => $qty,
                'warranty_expiry_date' => $candidate['warranty_expiry_date'],
                'problem_description' => $data['problem_description'],
                'intake_condition' => $data['intake_condition'] ?? null,
                'accessories_received' => $data['accessories_received'] ?? null,
                'status' => 'received',
                'remarks' => $data['remarks'] ?? null,
                'store_id' => $candidate['store_id'],
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $this->event($claim, 'received', "Received from customer: {$claim->problem_description}", $user);

            return $claim->fresh(['store', 'serviceTicket']);
        });
    }

    /** Step 2: after inspection, decide what happens to the unit. */
    public function decide(TWarrantyClaim $claim, array $data, User $user): TWarrantyClaim
    {
        return DB::transaction(function () use ($claim, $data, $user) {
            $claim = $this->lockClaim($claim);
            $this->assertStatus($claim, ['received'], 'Only received claims can be decided.');

            $resolution = $data['resolution'];
            if ($resolution === 'refund' && $claim->source_type !== 'invoice') {
                throw ValidationException::withMessages([
                    'resolution' => 'Hire purchase items cannot be refunded from a warranty claim. Use the hire purchase return instead.',
                ]);
            }
            if ($resolution === 'reject' && blank($data['outcome_note'] ?? null)) {
                throw ValidationException::withMessages([
                    'outcome_note' => 'Enter why the warranty claim is rejected.',
                ]);
            }

            $claim->fill([
                'resolution' => $resolution,
                'outcome_note' => $data['outcome_note'] ?? null,
                'decided_date' => $data['decision_date'],
                'decided_by' => $user->username,
            ]);

            match ($resolution) {
                'repair' => $this->resolveByRepair($claim, $user),
                'replace' => $this->resolveByReplacement($claim, $data, $user),
                'refund' => $this->resolveByRefund($claim, $data, $user),
                'reject' => $this->resolveByRejection($claim, $user),
            };

            return $claim->fresh(['store', 'serviceTicket']);
        });
    }

    /** Step 3: the repaired (or rejected) unit goes back to the customer. Free of charge. */
    public function handover(TWarrantyClaim $claim, array $data, User $user): TWarrantyClaim
    {
        return DB::transaction(function () use ($claim, $data, $user) {
            $claim = $this->lockClaim($claim);
            $this->assertStatus($claim, ['ready_for_pickup'], 'Only claims ready for pickup can be handed over.');

            if ($claim->service_ticket_no) {
                $ticket = TServiceReturn::query()
                    ->where('BC', $claim->BC)
                    ->where('ticket_no', $claim->service_ticket_no)
                    ->firstOrFail();
                $this->serviceTicketService->releaseWarrantyTicket(
                    $ticket,
                    $data['delivered_date'],
                    "Warranty claim {$claim->claim_no}.",
                    $user
                );
            }

            $claim->update([
                'status' => 'delivered',
                'delivered_date' => $data['delivered_date'],
                'completed_date' => $data['delivered_date'],
                'collected_by' => $data['collected_by'] ?? $claim->customer_name,
                'handover_note' => $data['handover_note'] ?? null,
                'delivered_by' => $user->username,
            ]);

            $this->event(
                $claim,
                'delivered',
                'Handed over to '.($claim->collected_by ?: 'customer').' free of charge.'
                    .($claim->resolution === 'reject' ? ' Returned without warranty repair.' : ''),
                $user
            );

            return $claim->fresh(['store', 'serviceTicket']);
        });
    }

    /** Damage found during repair: warranty is refused and the ticket becomes a paid job. */
    public function rejectInRepair(TWarrantyClaim $claim, string $reason, User $user): TWarrantyClaim
    {
        return DB::transaction(function () use ($claim, $reason, $user) {
            $claim = $this->lockClaim($claim);
            $this->assertStatus($claim, ['in_repair'], 'Only claims under repair can be rejected here.');

            $ticket = TServiceReturn::query()
                ->where('BC', $claim->BC)
                ->where('ticket_no', $claim->service_ticket_no)
                ->firstOrFail();
            $this->serviceTicketService->convertWarrantyToPaid($ticket, $reason, $user);

            $claim->update([
                'status' => 'rejected',
                'outcome_note' => trim(($claim->outcome_note ? $claim->outcome_note."\n" : '').$reason),
                'completed_date' => now()->toDateString(),
            ]);
            $this->event(
                $claim,
                'rejected',
                "Warranty rejected during repair: {$reason}. Service ticket {$ticket->ticket_no} continues as a paid job.",
                $user
            );

            return $claim->fresh(['store', 'serviceTicket']);
        });
    }

    /**
     * Everything that happened to one sold unit: the sale, the serial chain, every
     * warranty claim with its service work, and other (paid) service tickets.
     */
    public function history(string $sourceType, int $detailId, ?string $serial, string $branchCode): array
    {
        $detail = $this->findDetail($sourceType, $detailId, $branchCode);
        if (! $detail) {
            throw ValidationException::withMessages([
                'source_detail_id' => 'The selected sold item was not found.',
            ]);
        }

        $soldSerial = filled($serial) ? $this->originalSoldSerial(trim($serial), $branchCode) : null;
        $chain = $soldSerial ? $this->serialChain($soldSerial, $branchCode) : [];

        $claims = TWarrantyClaim::query()
            ->where('BC', $branchCode)
            ->where('source_type', $sourceType)
            ->where('source_detail_id', $detailId)
            ->when($chain, fn ($query) => $query->whereIn('item_serial_no', $chain))
            ->with(['events', 'serviceTicket.issues', 'serviceTicket.dispatches.supplier'])
            ->orderByDesc('id')
            ->get();

        $otherTickets = $chain
            ? TServiceReturn::query()
                ->where('BC', $branchCode)
                ->whereIn('item_serial_no', $chain)
                ->whereNotIn('ticket_no', $claims->pluck('service_ticket_no')->filter()->all())
                ->with(['issues', 'dispatches.supplier'])
                ->orderByDesc('id')
                ->get()
            : collect();

        return [
            'unit' => $this->candidate($sourceType, $detail, $soldSerial, $branchCode),
            'serial_chain' => $chain,
            'claims' => $claims,
            'service_tickets' => $otherTickets,
        ];
    }

    private function resolveByRepair(TWarrantyClaim $claim, User $user): void
    {
        if (! $claim->customer_code) {
            throw ValidationException::withMessages([
                'resolution' => 'The original sale has no customer, so a service ticket cannot be opened.',
            ]);
        }

        $ticket = $this->serviceTicketService->createTicket([
            'return_date' => $claim->decided_date->toDateString(),
            'customer_code' => $claim->customer_code,
            'item_code' => $claim->item_code,
            'item_serial_no' => $claim->item_serial_no,
            'problem_description' => "Warranty claim {$claim->claim_no}: {$claim->problem_description}",
            'intake_condition' => trim(implode(' | ', array_filter([
                $claim->intake_condition,
                $claim->accessories_received ? "Accessories: {$claim->accessories_received}" : null,
            ]))) ?: null,
            'is_warranty' => true,
        ], $user);

        $claim->service_ticket_no = $ticket->ticket_no;
        $claim->status = 'in_repair';
        $claim->save();
        $this->event($claim, 'decided', "Repair under warranty. Service ticket {$ticket->ticket_no} opened.", $user);
    }

    private function resolveByReplacement(TWarrantyClaim $claim, array $data, User $user): void
    {
        $item = Item::query()->where('BC', $claim->BC)->where('item_code', $claim->item_code)->firstOrFail();
        $detail = $this->findDetail($claim->source_type, $claim->source_detail_id, $claim->BC);
        $storeId = (int) ($data['replacement_store_id'] ?? $claim->store_id);
        $replacementSerial = $item->is_serialized ? ($data['replacement_serial_no'] ?? null) : null;
        $batchNo = $item->is_batch
            ? ($data['replacement_batch_no'] ?? $detail?->batch_no)
            : null;

        if ($item->is_serialized && blank($replacementSerial)) {
            throw ValidationException::withMessages([
                'replacement_serial_no' => 'Select the serial number of the replacement unit.',
            ]);
        }

        try {
            $this->stockService->dispatchStock(
                $claim->claim_no,
                'WARRANTY-REPLACE',
                $claim->item_code,
                $batchNo,
                $storeId,
                $claim->qty,
                $user->BC,
                $user->username,
                $replacementSerial ? [$replacementSerial] : null
            );
        } catch (\InvalidArgumentException|\RuntimeException $exception) {
            throw ValidationException::withMessages([
                'replacement_serial_no' => $exception->getMessage(),
            ]);
        }

        // The new unit goes to the customer straight away, so the claim is closed here.
        $claim->fill([
            'replacement_serial_no' => $replacementSerial,
            'replacement_batch_no' => $batchNo,
            'replacement_store_id' => $storeId,
            'status' => 'delivered',
            'completed_date' => $claim->decided_date,
            'delivered_date' => $claim->decided_date,
            'collected_by' => $data['collected_by'] ?? $claim->customer_name,
            'handover_note' => $data['handover_note'] ?? null,
            'delivered_by' => $user->username,
        ])->save();

        $this->event(
            $claim,
            'replaced',
            'Replaced free of charge'.($replacementSerial ? " with serial {$replacementSerial}" : '').' and handed over.',
            $user
        );
    }

    private function resolveByRefund(TWarrantyClaim $claim, array $data, User $user): void
    {
        $reason = SalesReturnReason::firstOrCreate(
            ['reason' => 'Warranty claim', 'BC' => $user->BC],
            ['UID' => $user->username]
        );

        $return = $this->salesService->createReturn([
            'return_date' => $claim->decided_date->toDateString(),
            'invoice_no' => $claim->invoice_no,
            'reason_id' => $reason->id,
            'refund_method' => $data['refund_method'] ?? 'cash',
            'restock' => false,
            'items' => [[
                'invoice_detail_id' => $claim->source_detail_id,
                'qty' => $claim->qty,
                'serial_numbers' => $claim->sold_serial_no ? [$claim->sold_serial_no] : [],
            ]],
        ], $user);

        $claim->fill([
            'sales_return_no' => $return->return_no,
            'status' => 'refunded',
            'completed_date' => $claim->decided_date,
        ])->save();

        $this->event($claim, 'refunded', "Refunded through sales return {$return->return_no}. Faulty unit kept by us.", $user);
    }

    private function resolveByRejection(TWarrantyClaim $claim, User $user): void
    {
        $claim->status = 'ready_for_pickup';
        $claim->save();
        $this->event($claim, 'decided', "Warranty rejected: {$claim->outcome_note}. Unit to be returned to the customer.", $user);
    }

    private function findDetail(string $sourceType, int $detailId, string $branchCode): ?Model
    {
        return ($sourceType === 'invoice' ? TInvoiceDeil::query() : THirePurchaseDetail::query())
            ->where('BC', $branchCode)
            ->whereKey($detailId)
            ->with(['sum', 'item'])
            ->first();
    }

    /** The claimable unit for one sold line; $serial is the serial the customer holds now. */
    private function candidateFor(string $sourceType, int $detailId, ?string $serial, string $branchCode): ?array
    {
        $detail = $this->findDetail($sourceType, $detailId, $branchCode);
        if (! $detail) {
            return null;
        }

        $serial = trim((string) $serial);
        if ($serial === '') {
            return empty($detail->serial_numbers)
                ? $this->candidate($sourceType, $detail, null, $branchCode)
                : null;
        }

        $soldSerial = $this->originalSoldSerial($serial, $branchCode);
        if (! in_array($soldSerial, $detail->serial_numbers ?? [], true)) {
            return null;
        }

        $candidate = $this->candidate($sourceType, $detail, $soldSerial, $branchCode);

        return $candidate['item_serial_no'] === $serial ? $candidate : null;
    }

    private function candidatesForLines(string $sourceType, Collection $details, Model $header, string $branchCode): Collection
    {
        return $details->flatMap(function (Model $detail) use ($sourceType, $header, $branchCode) {
            $detail->setRelation('sum', $header);
            $serials = $detail->serial_numbers ?? [];

            if (empty($serials)) {
                return [$this->candidate($sourceType, $detail, null, $branchCode)];
            }

            return collect($serials)->map(
                fn (string $serial) => $this->candidate($sourceType, $detail, $serial, $branchCode)
            );
        });
    }

    /**
     * One claimable unit. For serialized lines $soldSerial is the serial on the sale;
     * if it was replaced under warranty, the unit now carries the replacement serial.
     */
    private function candidate(string $sourceType, Model $detail, ?string $soldSerial, string $branchCode): array
    {
        $isInvoice = $sourceType === 'invoice';
        $header = $detail->sum;
        $item = $detail->item;
        $soldQty = (int) ($isInvoice ? $detail->QTY : $detail->qty);
        $chain = $soldSerial ? $this->serialChain($soldSerial, $branchCode) : [];
        $currentSerial = $chain ? end($chain) : null;

        $returnedQty = $isInvoice
            ? (int) TSalesReturnDetail::query()->where('invoice_detail_id', $detail->id)->sum('qty')
            : (int) $detail->returned_qty;
        $serialReturned = $isInvoice && $soldSerial
            ? TSalesReturnDetail::query()
                ->where('invoice_detail_id', $detail->id)
                ->whereJsonContains('serial_numbers', $soldSerial)
                ->exists()
            : false;

        $unitClaims = TWarrantyClaim::query()
            ->where('BC', $branchCode)
            ->where('source_type', $sourceType)
            ->where('source_detail_id', $detail->id)
            ->when($chain, fn ($query) => $query->whereIn('item_serial_no', $chain))
            ->get(['id', 'claim_no', 'status', 'qty', 'item_serial_no']);
        $custodyClaim = $unitClaims
            ->whereIn('status', self::CUSTODY_STATUSES)
            ->when($currentSerial, fn ($claims) => $claims->where('item_serial_no', $currentSerial))
            ->sortByDesc('id')
            ->first();
        $openTicket = $currentSerial
            ? TServiceReturn::query()
                ->where('BC', $branchCode)
                ->where('item_serial_no', $currentSerial)
                ->where('status', '!=', 'completed')
                ->latest('id')
                ->first(['ticket_no', 'status'])
            : null;

        $expiry = $detail->warranty_expiry_date?->toDateString();
        $daysLeft = $expiry ? (int) now()->startOfDay()->diffInDays($detail->warranty_expiry_date, false) : null;
        $qtyWithUs = $soldSerial ? 0 : (int) $unitClaims->whereIn('status', self::CUSTODY_STATUSES)->sum('qty');
        $claimableQty = $soldSerial ? 1 : max(0, $soldQty - $returnedQty - $qtyWithUs);

        $custodyReason = match (true) {
            $custodyClaim !== null && ($soldSerial || $claimableQty < 1) => sprintf(
                'Item is with us under warranty claim %s (%s).',
                $custodyClaim->claim_no,
                str_replace('_', ' ', $custodyClaim->status)
            ),
            $openTicket !== null => "Item is with us under service ticket {$openTicket->ticket_no}.",
            default => null,
        };

        $reason = match (true) {
            ! $detail->warranty_enabled || ! $expiry => 'This item was sold without warranty.',
            ! $isInvoice && $header?->status === 'returned',
            $serialReturned,
            ! $soldSerial && $returnedQty >= $soldQty => 'This item has already been returned.',
            $custodyReason !== null => $custodyReason,
            $daysLeft < 0 => "Warranty expired on {$expiry}.",
            default => null,
        };

        return [
            'source_type' => $sourceType,
            'source_detail_id' => (int) $detail->id,
            'invoice_no' => $isInvoice ? $detail->Invoice_no : $detail->invoice_no,
            'agreement_no' => $isInvoice ? null : $header?->agreement_no,
            'sale_date' => substr((string) ($isInvoice ? $header?->Invoice_date : $header?->invoice_date), 0, 10),
            'customer_code' => $header?->customer_code,
            'customer_name' => $isInvoice ? $header?->Customer_Name : $header?->customer_name,
            'customer_phone' => $isInvoice ? $header?->Customer_Phone : $header?->customer_phone,
            'item_code' => $isInvoice ? $detail->Item_code : $detail->item_code,
            'item_description' => $isInvoice ? $detail->Item_description : $detail->item_description,
            'is_serialized' => (bool) $item?->is_serialized,
            'is_batch' => (bool) $item?->is_batch,
            'batch_no' => $detail->batch_no,
            'store_id' => $detail->store_id ? (int) $detail->store_id : null,
            'sold_serial_no' => $soldSerial,
            'item_serial_no' => $currentSerial,
            'sold_qty' => $soldQty,
            'claimable_qty' => $claimableQty,
            'warranty_months' => $detail->warranty_months,
            'warranty_expiry_date' => $expiry,
            'days_left' => $daysLeft,
            'claim_count' => $unitClaims->count(),
            'custody_claim' => $custodyClaim ? [
                'id' => $custodyClaim->id,
                'claim_no' => $custodyClaim->claim_no,
                'status' => $custodyClaim->status,
            ] : null,
            'eligible' => $reason === null,
            'reason' => $reason,
        ];
    }

    /** The sold serial followed by every warranty replacement, ending with the unit the customer holds now. */
    private function serialChain(string $soldSerial, string $branchCode): array
    {
        $chain = [$soldSerial];
        $serial = $soldSerial;

        while (true) {
            $replacement = TWarrantyClaim::query()
                ->where('BC', $branchCode)
                ->where('item_serial_no', $serial)
                ->where('resolution', 'replace')
                ->whereNotNull('replacement_serial_no')
                ->latest('id')
                ->value('replacement_serial_no');

            if (! $replacement || in_array($replacement, $chain, true)) {
                break;
            }
            $chain[] = $replacement;
            $serial = $replacement;
        }

        return $chain;
    }

    /** Follow replacements back: the serial that appears on the original sale. */
    private function originalSoldSerial(string $serial, string $branchCode): string
    {
        $seen = [];
        while (! in_array($serial, $seen, true)) {
            $seen[] = $serial;
            $original = TWarrantyClaim::query()
                ->where('BC', $branchCode)
                ->where('replacement_serial_no', $serial)
                ->where('resolution', 'replace')
                ->latest('id')
                ->value('item_serial_no');

            if (! $original) {
                break;
            }
            $serial = $original;
        }

        return $serial;
    }

    private function lockClaim(TWarrantyClaim $claim): TWarrantyClaim
    {
        return TWarrantyClaim::query()->whereKey($claim->id)->lockForUpdate()->firstOrFail();
    }

    private function assertStatus(TWarrantyClaim $claim, array $allowed, string $message): void
    {
        if (! in_array($claim->status, $allowed, true)) {
            throw ValidationException::withMessages(['claim' => $message]);
        }
    }

    private function event(TWarrantyClaim $claim, string $event, string $description, User $user): void
    {
        TWarrantyClaimEvent::create([
            'claim_no' => $claim->claim_no,
            'event' => $event,
            'description' => $description,
            'BC' => $user->BC,
            'UID' => $user->username,
        ]);
    }

    private function nextNumber(string $BC): string
    {
        $base = 'WCL-'.$BC.'-'.now()->format('Ymd').'-';
        $sequence = TWarrantyClaim::query()->where('claim_no', 'like', $base.'%')->count() + 1;

        do {
            $number = $base.str_pad((string) $sequence, 4, '0', STR_PAD_LEFT);
            $sequence++;
        } while (TWarrantyClaim::query()->where('claim_no', $number)->exists());

        return $number;
    }
}
