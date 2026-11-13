<?php

namespace App\Services;

use App\Models\Item;
use App\Models\SerialWarranty;
use App\Models\Store;
use App\Models\Supplier;
use App\Models\THirePurchaseDetail;
use App\Models\THirePurchaseReturnSum;
use App\Models\THirePurchaseSum;
use App\Models\TInvoiceDeil;
use App\Models\TInvoiceSum;
use App\Models\TItemSerialMovement;
use App\Models\TPurchasesDetail;
use App\Models\TPurchasesSum;
use App\Models\TSalesReturnDetail;
use App\Models\TSalesReturnSum;
use App\Models\TServiceReturn;
use App\Models\WarrantyClaim;
use Carbon\Carbon;
use Carbon\CarbonInterface;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Keeps warranty records in serial_warranties.
 *  - Serialized items: one row per serial unit. Supplier warranty starts on its GRN date.
 *  - Non-serialized items: one row per sale line (item_serial_no NULL) holding the sold and
 *    returned quantity. Supplier warranty comes from the matching batch GRN, or the latest
 *    GRN of the item on or before the sale date.
 * Customer warranty always starts on the sale / HP date. Items without warranty are ignored.
 */
class WarrantyService
{
    public const STATUS_IN_STOCK = 'in_stock';
    public const STATUS_ACTIVE = 'active';
    public const STATUS_RETURNED = 'returned';
    public const STATUS_VOID = 'void';
    public const STATUS_CANCELLED = 'cancelled';

    private const CANCEL_FIELDS = [
        'status_before_cancel' => null,
        'cancel_reason' => null,
        'cancelled_by' => null,
        'cancelled_at' => null,
    ];

    public function recordPurchase(
        string $grnNo,
        string $grnDate,
        string $supplierCode,
        Item $item,
        ?array $serialNumbers,
        string $BC,
        string $UID
    ): void {
        // Only serialized units can be tied to their GRN; non-serial lines resolve it at sale time.
        if (! $item->has_warranty || ! $item->is_serialized || empty($serialNumbers)) {
            return;
        }

        foreach ($serialNumbers as $serialNo) {
            $warranty = $this->findOrNewSerial($item->item_code, $serialNo, $BC);

            // A re-purchased unit starts a fresh warranty cycle.
            $warranty->fill($this->supplierFields($item, $grnNo, $grnDate, $supplierCode) + [
                'qty' => 1,
                'returned_qty' => 0,
                'status' => self::STATUS_IN_STOCK,
                'UID' => $UID,
            ] + self::CANCEL_FIELDS);
            $this->clearSale($warranty);
            $warranty->save();
        }
    }

    public function recordSale(
        string $saleType,
        string $saleNo,
        string $saleDate,
        ?string $customerCode,
        ?string $customerName,
        ?string $customerPhone,
        Item $item,
        ?array $serialNumbers,
        ?string $batchNo,
        int $qty,
        string $BC,
        string $UID
    ): void {
        if (! $item->has_warranty || $qty <= 0) {
            return;
        }

        $saleFields = [
            'sale_type' => $saleType,
            'sale_no' => $saleNo,
            'sale_date' => $saleDate,
            'customer_code' => $customerCode,
            'customer_name' => $customerName,
            'customer_phone' => $customerPhone,
            'warranty_period' => $item->warranty_period,
            'warranty_unit' => $item->warranty_unit,
            'customer_warranty_expiry' => $this->addPeriod($saleDate, (int) $item->warranty_period, $item->warranty_unit),
            'status' => self::STATUS_ACTIVE,
            'UID' => $UID,
        ];

        if ($item->is_serialized) {
            foreach ($serialNumbers ?? [] as $serialNo) {
                $warranty = $this->findOrNewSerial($item->item_code, $serialNo, $BC);
                // A re-sold unit gets a fresh warranty, even if an earlier one was cancelled.
                $warranty->fill($saleFields + ['qty' => 1, 'returned_qty' => 0] + self::CANCEL_FIELDS);
                $warranty->save();
            }

            return;
        }

        // Same item and batch twice on one invoice: keep one row and add the quantity.
        $warranty = SerialWarranty::query()
            ->where('BC', $BC)
            ->where('sale_no', $saleNo)
            ->where('item_code', $item->item_code)
            ->whereNull('item_serial_no')
            ->where(fn ($query) => $batchNo === null ? $query->whereNull('batch_no') : $query->where('batch_no', $batchNo))
            ->lockForUpdate()
            ->first();

        if ($warranty) {
            $warranty->qty = (int) $warranty->qty + $qty;
            $warranty->UID = $UID;
            $warranty->save();

            return;
        }

        $grn = $this->sourceGrn($item, $batchNo, $saleDate, $BC);

        SerialWarranty::create($saleFields + [
            'item_code' => $item->item_code,
            'item_serial_no' => null,
            'batch_no' => $batchNo,
            'qty' => $qty,
            'returned_qty' => 0,
            'BC' => $BC,
        ] + ($grn ? $this->supplierFields($item, $grn->Invoice_no, Carbon::parse($grn->Invoice_date)->toDateString(), $grn->supplier_code) : []));
    }

    /**
     * Sales return / HP return. Serialized units go back in stock and lose the customer warranty;
     * non-serialized lines record the returned quantity.
     */
    public function recordReturn(
        string $saleNo,
        Item $item,
        ?string $batchNo,
        int $qty,
        ?array $serialNumbers,
        string $BC,
        string $UID
    ): void {
        if ($item->is_serialized) {
            if (empty($serialNumbers)) {
                return;
            }

            SerialWarranty::query()
                ->where('BC', $BC)
                ->where('item_code', $item->item_code)
                ->where('sale_no', $saleNo)
                ->whereIn('item_serial_no', $serialNumbers)
                ->get()
                ->each(function (SerialWarranty $warranty) use ($UID) {
                    $this->clearSale($warranty);
                    $warranty->fill(self::CANCEL_FIELDS);
                    $warranty->status = self::STATUS_IN_STOCK;
                    $warranty->UID = $UID;
                    $warranty->save();
                });

            return;
        }

        $remaining = $qty;
        $rows = SerialWarranty::query()
            ->where('BC', $BC)
            ->where('sale_no', $saleNo)
            ->where('item_code', $item->item_code)
            ->whereNull('item_serial_no')
            ->where(fn ($query) => $batchNo === null ? $query->whereNull('batch_no') : $query->where('batch_no', $batchNo))
            ->lockForUpdate()
            ->orderBy('id')
            ->get();

        foreach ($rows as $warranty) {
            if ($remaining <= 0) {
                break;
            }

            $returnable = (int) $warranty->qty - (int) $warranty->returned_qty;
            $taken = min($returnable, $remaining);
            if ($taken <= 0) {
                continue;
            }

            $warranty->returned_qty = (int) $warranty->returned_qty + $taken;
            if ($warranty->returned_qty >= $warranty->qty) {
                $warranty->status = self::STATUS_RETURNED;
            }
            $warranty->UID = $UID;
            $warranty->save();
            $remaining -= $taken;
        }
    }

    /**
     * GRN serial correction: drop rows for serials that were replaced and create the new ones.
     */
    public function replacePurchaseSerials(
        string $grnNo,
        string $grnDate,
        string $supplierCode,
        Item $item,
        array $oldSerials,
        array $newSerials,
        string $BC,
        string $UID
    ): void {
        $removed = array_values(array_diff($oldSerials, $newSerials));
        if ($removed) {
            SerialWarranty::query()
                ->where('BC', $BC)
                ->where('item_code', $item->item_code)
                ->where('grn_no', $grnNo)
                ->where('status', self::STATUS_IN_STOCK)
                ->whereIn('item_serial_no', $removed)
                ->delete();
        }

        $this->recordPurchase(
            $grnNo,
            $grnDate,
            $supplierCode,
            $item,
            array_values(array_diff($newSerials, $oldSerials)),
            $BC,
            $UID
        );
    }

    /**
     * Cancels a customer warranty (e.g. tampering or physical damage). Sale details are kept and
     * the warranty can be restored. Open claims on the unit must be closed first.
     */
    public function cancel(SerialWarranty $warranty, string $reason, string $UID): SerialWarranty
    {
        if (! in_array($warranty->status, [self::STATUS_ACTIVE, self::STATUS_IN_STOCK], true)) {
            throw ValidationException::withMessages([
                'warranty' => 'Only an active or in-stock warranty can be cancelled.',
            ]);
        }

        $openClaim = WarrantyClaim::query()
            ->where('BC', $warranty->BC)
            ->where('item_code', $warranty->item_code)
            ->where(fn ($query) => $warranty->item_serial_no !== null
                ? $query->where('item_serial_no', $warranty->item_serial_no)
                : $query->where('serial_warranty_id', $warranty->id))
            ->whereIn('status', WarrantyClaimService::OPEN_STATUSES)
            ->value('claim_no');

        if ($openClaim) {
            throw ValidationException::withMessages([
                'warranty' => "Close open claim {$openClaim} before cancelling this warranty.",
            ]);
        }

        $warranty->fill([
            'status_before_cancel' => $warranty->status,
            'status' => self::STATUS_CANCELLED,
            'cancel_reason' => trim($reason),
            'cancelled_by' => $UID,
            'cancelled_at' => now(),
            'UID' => $UID,
        ]);
        $warranty->save();

        return $warranty;
    }

    public function restore(SerialWarranty $warranty, string $UID): SerialWarranty
    {
        if ($warranty->status !== self::STATUS_CANCELLED) {
            throw ValidationException::withMessages([
                'warranty' => 'Only a cancelled warranty can be restored.',
            ]);
        }

        $warranty->fill([
            'status' => $warranty->status_before_cancel ?: self::STATUS_ACTIVE,
            'UID' => $UID,
        ] + self::CANCEL_FIELDS);
        $warranty->save();

        return $warranty;
    }

    /**
     * Warranty claim replacement of a serialized unit: the customer warranty moves to the
     * new serial with the same expiry; the faulty unit's warranty is voided.
     */
    public function transferToReplacement(SerialWarranty $faulty, string $newSerialNo, string $UID): SerialWarranty
    {
        $replacement = $this->findOrNewSerial($faulty->item_code, $newSerialNo, $faulty->BC);
        $replacement->fill([
            'sale_type' => $faulty->sale_type,
            'sale_no' => $faulty->sale_no,
            'sale_date' => $faulty->sale_date,
            'customer_code' => $faulty->customer_code,
            'customer_name' => $faulty->customer_name,
            'customer_phone' => $faulty->customer_phone,
            'warranty_period' => $faulty->warranty_period,
            'warranty_unit' => $faulty->warranty_unit,
            'customer_warranty_expiry' => $faulty->customer_warranty_expiry,
            'qty' => 1,
            'returned_qty' => 0,
            'status' => self::STATUS_ACTIVE,
            'UID' => $UID,
        ]);
        $replacement->save();

        $faulty->status = self::STATUS_VOID;
        $faulty->UID = $UID;
        $faulty->save();

        return $replacement;
    }

    /**
     * Everything known about a serial: one entry per item that used this serial number.
     */
    public function lookup(string $serialNo, string $BC): array
    {
        $serialNo = trim($serialNo);

        $itemCodes = TItemSerialMovement::query()
            ->where('bc', $BC)
            ->where('item_serial_no', $serialNo)
            ->distinct()
            ->pluck('item_code')
            ->merge(
                SerialWarranty::query()
                    ->where('BC', $BC)
                    ->where('item_serial_no', $serialNo)
                    ->pluck('item_code')
            )
            ->unique()
            ->values();

        if ($itemCodes->isEmpty()) {
            return [];
        }

        $items = $this->itemsByCode($itemCodes, $BC);
        $stores = Store::query()->where('BC', $BC)->pluck('name', 'id');

        return $itemCodes->map(function (string $itemCode) use ($serialNo, $BC, $items, $stores) {
            $warranty = SerialWarranty::query()
                ->where('BC', $BC)
                ->where('item_code', $itemCode)
                ->where('item_serial_no', $serialNo)
                ->first();

            return $this->unitPayload($itemCode, $serialNo, $warranty, $items, $stores, $BC);
        })->values()->all();
    }

    /**
     * Warranty lines of one sale (serialized and non-serialized). Accepts the sales invoice no,
     * the HP invoice no, the HP agreement no, or the reference no of either.
     */
    public function lookupInvoice(string $saleNo, string $BC): array
    {
        $saleNo = trim($saleNo);

        // Warranty rows are keyed by the invoice no; map agreement / reference numbers to it.
        $saleNos = collect([$saleNo])
            ->merge(
                THirePurchaseSum::query()
                    ->where('BC', $BC)
                    ->where(fn ($query) => $query->where('agreement_no', $saleNo)->orWhere('reference_no', $saleNo))
                    ->pluck('invoice_no')
            )
            ->merge(
                TInvoiceSum::query()
                    ->where('BC', $BC)
                    ->where('reference_no', $saleNo)
                    ->pluck('Invoice_no')
            )
            ->unique()
            ->values();

        $rows = SerialWarranty::query()
            ->where('BC', $BC)
            ->whereIn('sale_no', $saleNos)
            ->orderBy('item_code')
            ->orderBy('item_serial_no')
            ->get();

        if ($rows->isEmpty()) {
            return [];
        }

        $items = $this->itemsByCode($rows->pluck('item_code')->unique(), $BC);
        $stores = Store::query()->where('BC', $BC)->pluck('name', 'id');

        return $rows
            ->map(fn (SerialWarranty $warranty) => $this->unitPayload(
                $warranty->item_code,
                $warranty->item_serial_no,
                $warranty,
                $items,
                $stores,
                $BC
            ))
            ->values()
            ->all();
    }

    /**
     * Rebuilds warranty records for items that include warranty. Serialized items are replayed
     * from the serial movement ledger; non-serialized items from sale and return lines.
     * Safe to re-run.
     */
    public function backfill(?string $BC = null): int
    {
        $items = Item::query()
            ->where('has_warranty', true)
            ->when($BC, fn ($query) => $query->where('BC', $BC))
            ->get();
        $records = 0;

        foreach ($items as $item) {
            DB::transaction(function () use ($item, &$records) {
                $records += $item->is_serialized
                    ? $this->backfillSerialItem($item)
                    : $this->backfillNonSerialItem($item);
            });
        }

        return $records;
    }

    public function customerWarrantyValid(?SerialWarranty $warranty, ?CarbonInterface $on = null): bool
    {
        return $warranty !== null
            && $warranty->status === self::STATUS_ACTIVE
            && $warranty->customer_warranty_expiry !== null
            && $warranty->customer_warranty_expiry->copy()->endOfDay()->gte($on ?? now());
    }

    public function supplierWarrantyValid(?SerialWarranty $warranty, ?CarbonInterface $on = null): bool
    {
        return $warranty !== null
            && $warranty->supplier_code !== null
            && $warranty->supplier_warranty_expiry !== null
            && $warranty->supplier_warranty_expiry->copy()->endOfDay()->gte($on ?? now());
    }

    /**
     * Units of a non-serialized warranty line that are still with the customer and not already
     * in an open claim.
     */
    public function claimableQty(SerialWarranty $warranty, ?int $ignoreClaimId = null): int
    {
        $openClaimQty = (int) WarrantyClaim::query()
            ->where('serial_warranty_id', $warranty->id)
            ->whereIn('status', WarrantyClaimService::OPEN_STATUSES)
            ->when($ignoreClaimId, fn ($query) => $query->whereKeyNot($ignoreClaimId))
            ->sum('qty');

        return max(0, (int) $warranty->qty - (int) $warranty->returned_qty - $openClaimQty);
    }

    public function addPeriod(string|CarbonInterface $from, int $period, ?string $unit): string
    {
        $date = Carbon::parse($from)->startOfDay();

        $date = match ($unit) {
            'days' => $date->addDays($period),
            'years' => $date->addYearsNoOverflow($period),
            default => $date->addMonthsNoOverflow($period),
        };

        // A 12-month warranty bought on 1 Jan ends on 31 Dec.
        return $date->subDay()->toDateString();
    }

    private function unitPayload(
        string $itemCode,
        ?string $serialNo,
        ?SerialWarranty $warranty,
        Collection $items,
        Collection $stores,
        string $BC
    ): array {
        $item = $items->get($itemCode);
        $movements = collect();
        $balance = 0;
        $currentStoreId = null;

        if ($serialNo !== null) {
            $movements = TItemSerialMovement::query()
                ->where('bc', $BC)
                ->where('item_code', $itemCode)
                ->where('item_serial_no', $serialNo)
                ->orderBy('dDate')
                ->orderBy('id')
                ->get()
                ->map(fn (TItemSerialMovement $movement) => [
                    'trans_no' => $movement->trans_no,
                    'trans_code' => $movement->trans_code,
                    'date' => $movement->dDate?->format('Y-m-d'),
                    'qty_in' => (int) $movement->qun_in,
                    'qty_out' => (int) $movement->qun_out,
                    'store_id' => $movement->store_id,
                    'store_name' => $stores->get($movement->store_id),
                ]);

            $balance = $movements->sum(fn (array $row) => $row['qty_in'] - $row['qty_out']);
            $currentStoreId = $balance > 0
                ? $movements->filter(fn (array $row) => $row['qty_in'] > 0)->last()['store_id'] ?? null
                : null;
        }

        $claims = WarrantyClaim::query()
            ->where('BC', $BC)
            ->where('item_code', $itemCode)
            ->when(
                $serialNo !== null,
                fn ($query) => $query->where('item_serial_no', $serialNo),
                fn ($query) => $query->where('serial_warranty_id', $warranty?->id)
            )
            ->orderByDesc('id')
            ->get(['id', 'claim_no', 'claim_date', 'qty', 'status', 'resolution', 'fault_description']);

        $serviceTickets = TServiceReturn::query()
            ->where('BC', $BC)
            ->where('item_code', $itemCode)
            ->when(
                $serialNo !== null,
                fn ($query) => $query->where('item_serial_no', $serialNo),
                fn ($query) => $query->where('serial_warranty_id', $warranty?->id ?? 0)
            )
            ->orderByDesc('id')
            ->get(['id', 'ticket_no', 'return_date', 'status', 'is_warranty', 'problem_description']);

        $supplierName = $warranty?->supplier_code
            ? Supplier::query()->where('BC', $BC)->where('Code', $warranty->supplier_code)->value('name')
            : null;

        return [
            'item_code' => $itemCode,
            'item_serial_no' => $serialNo,
            'is_serialized' => $serialNo !== null,
            'item' => $item ? [
                'item_code' => $item->item_code,
                'item_description' => $item->item_description,
                'is_serialized' => (bool) $item->is_serialized,
                'is_batch' => (bool) $item->is_batch,
                'has_warranty' => (bool) $item->has_warranty,
                'warranty_period' => $item->warranty_period,
                'warranty_unit' => $item->warranty_unit,
                'supplier_warranty_period' => $item->supplier_warranty_period,
                'supplier_warranty_unit' => $item->supplier_warranty_unit,
                'warranty_terms' => $item->warranty_terms,
            ] : null,
            'warranty' => $warranty,
            'supplier_name' => $supplierName,
            'in_stock' => $balance > 0,
            'current_store_id' => $currentStoreId,
            'current_store_name' => $currentStoreId ? $stores->get($currentStoreId) : null,
            'customer_warranty_valid' => $this->customerWarrantyValid($warranty),
            'supplier_warranty_valid' => $this->supplierWarrantyValid($warranty),
            'customer_days_left' => $this->daysLeft($warranty?->customer_warranty_expiry),
            'supplier_days_left' => $this->daysLeft($warranty?->supplier_warranty_expiry),
            'claimable_qty' => $warranty
                ? ($serialNo !== null ? 1 : $this->claimableQty($warranty))
                : 0,
            'movements' => $movements->values(),
            'claims' => $claims,
            'service_tickets' => $serviceTickets,
        ];
    }

    private function backfillSerialItem(Item $item): int
    {
        $records = 0;
        $BC = $item->BC;

        // Replaying the ledger resets each unit, so remember cancellations and re-apply them.
        $cancelled = SerialWarranty::query()
            ->where('BC', $BC)
            ->where('item_code', $item->item_code)
            ->whereNotNull('item_serial_no')
            ->where('status', self::STATUS_CANCELLED)
            ->get();

        $movements = TItemSerialMovement::query()
            ->where('bc', $BC)
            ->where('item_code', $item->item_code)
            ->whereIn('trans_code', ['GRN', 'SALE', 'HP-SALE', 'SALE-RETURN', 'HP-RETURN'])
            ->orderBy('dDate')
            ->orderBy('id')
            ->get();

        foreach ($movements as $movement) {
            $serials = [$movement->item_serial_no];

            switch ($movement->trans_code) {
                case 'GRN':
                    $grn = TPurchasesSum::query()->where('BC', $BC)->where('Invoice_no', $movement->trans_no)->first();
                    if ($grn) {
                        $this->recordPurchase($grn->Invoice_no, Carbon::parse($grn->Invoice_date)->toDateString(), $grn->supplier_code, $item, $serials, $BC, 'system');
                        $records++;
                    }
                    break;

                case 'SALE':
                    $invoice = TInvoiceSum::query()->where('BC', $BC)->where('Invoice_no', $movement->trans_no)->first();
                    if ($invoice) {
                        $this->recordSale('SALE', $invoice->Invoice_no, Carbon::parse($invoice->Invoice_date)->toDateString(), $invoice->customer_code, $invoice->Customer_Name, $invoice->Customer_Phone, $item, $serials, null, 1, $BC, 'system');
                        $records++;
                    }
                    break;

                case 'HP-SALE':
                    $agreement = THirePurchaseSum::query()->where('BC', $BC)->where('invoice_no', $movement->trans_no)->first();
                    if ($agreement) {
                        $this->recordSale('HP', $agreement->invoice_no, Carbon::parse($agreement->invoice_date)->toDateString(), $agreement->customer_code, $agreement->customer_name, $agreement->customer_phone, $item, $serials, null, 1, $BC, 'system');
                        $records++;
                    }
                    break;

                case 'SALE-RETURN':
                    $invoiceNo = TSalesReturnSum::query()->where('BC', $BC)->where('return_no', $movement->trans_no)->value('invoice_no');
                    if ($invoiceNo) {
                        $this->recordReturn($invoiceNo, $item, null, 1, $serials, $BC, 'system');
                    }
                    break;

                case 'HP-RETURN':
                    $invoiceNo = THirePurchaseReturnSum::query()->where('bc', $BC)->where('hpreturn_code', $movement->trans_no)->value('invoice_no');
                    if ($invoiceNo) {
                        $this->recordReturn($invoiceNo, $item, null, 1, $serials, $BC, 'system');
                    }
                    break;
            }
        }

        foreach ($cancelled as $previous) {
            $current = SerialWarranty::query()
                ->where('BC', $BC)
                ->where('item_code', $item->item_code)
                ->where('item_serial_no', $previous->item_serial_no)
                ->first();

            // Only while the unit is still on the same sale as when it was cancelled.
            if ($current && $current->sale_no === $previous->sale_no) {
                $current->fill([
                    'status_before_cancel' => $current->status,
                    'status' => self::STATUS_CANCELLED,
                    'cancel_reason' => $previous->cancel_reason,
                    'cancelled_by' => $previous->cancelled_by,
                    'cancelled_at' => $previous->cancelled_at,
                ]);
                $current->save();
            }
        }

        return $records;
    }

    private function backfillNonSerialItem(Item $item): int
    {
        $BC = $item->BC;

        // Rebuild from scratch, but keep lines that have claims attached or were cancelled.
        $claimedIds = WarrantyClaim::query()->where('BC', $BC)->whereNotNull('serial_warranty_id')->pluck('serial_warranty_id')
            ->merge(
                SerialWarranty::query()
                    ->where('BC', $BC)
                    ->where('item_code', $item->item_code)
                    ->whereNull('item_serial_no')
                    ->where('status', self::STATUS_CANCELLED)
                    ->pluck('id')
            );
        $claimedLines = SerialWarranty::query()
            ->where('BC', $BC)
            ->where('item_code', $item->item_code)
            ->whereNull('item_serial_no')
            ->whereIn('id', $claimedIds)
            ->get(['sale_no', 'batch_no'])
            ->map(fn (SerialWarranty $row) => $row->sale_no.'|'.$row->batch_no)
            ->all();

        SerialWarranty::query()
            ->where('BC', $BC)
            ->where('item_code', $item->item_code)
            ->whereNull('item_serial_no')
            ->whereNotIn('id', $claimedIds)
            ->delete();

        $records = 0;

        $invoiceLines = TInvoiceDeil::query()
            ->where('BC', $BC)
            ->where('Item_code', $item->item_code)
            ->orderBy('id')
            ->get();
        $invoices = TInvoiceSum::query()
            ->where('BC', $BC)
            ->whereIn('Invoice_no', $invoiceLines->pluck('Invoice_no')->unique())
            ->get()
            ->keyBy('Invoice_no');
        $returnedByLine = TSalesReturnDetail::query()
            ->whereIn('invoice_detail_id', $invoiceLines->pluck('id'))
            ->selectRaw('invoice_detail_id, SUM(qty) as returned')
            ->groupBy('invoice_detail_id')
            ->pluck('returned', 'invoice_detail_id');

        foreach ($invoiceLines as $line) {
            $invoice = $invoices->get($line->Invoice_no);
            if (! $invoice || in_array($line->Invoice_no.'|'.$line->batch_no, $claimedLines, true)) {
                continue;
            }

            $this->recordSale('SALE', $invoice->Invoice_no, Carbon::parse($invoice->Invoice_date)->toDateString(), $invoice->customer_code, $invoice->Customer_Name, $invoice->Customer_Phone, $item, null, $line->batch_no, (int) $line->QTY, $BC, 'system');
            $returned = (int) ($returnedByLine[$line->id] ?? 0);
            if ($returned > 0) {
                $this->recordReturn($invoice->Invoice_no, $item, $line->batch_no, $returned, null, $BC, 'system');
            }
            $records++;
        }

        $hpLines = THirePurchaseDetail::query()
            ->where('BC', $BC)
            ->where('item_code', $item->item_code)
            ->orderBy('id')
            ->get();
        $agreements = THirePurchaseSum::query()
            ->where('BC', $BC)
            ->where('is_opening', false)
            ->whereIn('invoice_no', $hpLines->pluck('invoice_no')->unique())
            ->get()
            ->keyBy('invoice_no');

        foreach ($hpLines as $line) {
            $agreement = $agreements->get($line->invoice_no);
            if (! $agreement || in_array($line->invoice_no.'|'.$line->batch_no, $claimedLines, true)) {
                continue;
            }

            $this->recordSale('HP', $agreement->invoice_no, Carbon::parse($agreement->invoice_date)->toDateString(), $agreement->customer_code, $agreement->customer_name, $agreement->customer_phone, $item, null, $line->batch_no, (int) $line->qty, $BC, 'system');
            if ((int) $line->returned_qty > 0) {
                $this->recordReturn($agreement->invoice_no, $item, $line->batch_no, (int) $line->returned_qty, null, $BC, 'system');
            }
            $records++;
        }

        return $records;
    }

    /**
     * GRN a non-serialized sale most likely came from: the GRN of the same batch, otherwise the
     * latest GRN of the item on or before the sale date.
     */
    private function sourceGrn(Item $item, ?string $batchNo, string $saleDate, string $BC): ?object
    {
        return TPurchasesDetail::query()
            ->from('t_purchases_details as pd')
            ->join('t_purchases_sums as ps', function ($join) {
                $join->on('ps.Invoice_no', '=', 'pd.Invoice_no')->on('ps.BC', '=', 'pd.BC');
            })
            ->where('pd.BC', $BC)
            ->where('pd.Item_code', $item->item_code)
            ->when($item->is_batch && $batchNo, fn ($query) => $query->where('pd.batch_no', $batchNo))
            ->whereDate('ps.Invoice_date', '<=', $saleDate)
            ->orderByDesc('ps.Invoice_date')
            ->orderByDesc('pd.id')
            ->select('ps.Invoice_no', 'ps.Invoice_date', 'ps.supplier_code')
            ->toBase()
            ->first();
    }

    private function supplierFields(Item $item, string $grnNo, string $grnDate, ?string $supplierCode): array
    {
        return [
            'grn_no' => $grnNo,
            'grn_date' => $grnDate,
            'supplier_code' => $supplierCode,
            'supplier_warranty_period' => $item->supplier_warranty_period,
            'supplier_warranty_unit' => $item->supplier_warranty_period ? $item->supplier_warranty_unit : null,
            'supplier_warranty_expiry' => $item->supplier_warranty_period
                ? $this->addPeriod($grnDate, $item->supplier_warranty_period, $item->supplier_warranty_unit)
                : null,
        ];
    }

    private function itemsByCode(Collection $itemCodes, string $BC): Collection
    {
        return Item::query()
            ->where('BC', $BC)
            ->whereIn('item_code', $itemCodes)
            ->get()
            ->keyBy('item_code');
    }

    private function daysLeft(?CarbonInterface $expiry): ?int
    {
        if (! $expiry) {
            return null;
        }

        return (int) now()->startOfDay()->diffInDays($expiry->copy()->startOfDay(), false);
    }

    private function findOrNewSerial(string $itemCode, string $serialNo, string $BC): SerialWarranty
    {
        return SerialWarranty::query()
            ->where('BC', $BC)
            ->where('item_code', $itemCode)
            ->where('item_serial_no', $serialNo)
            ->lockForUpdate()
            ->first()
            ?? new SerialWarranty([
                'item_code' => $itemCode,
                'item_serial_no' => $serialNo,
                'BC' => $BC,
            ]);
    }

    private function clearSale(SerialWarranty $warranty): void
    {
        $warranty->fill([
            'sale_type' => null,
            'sale_no' => null,
            'sale_date' => null,
            'customer_code' => null,
            'customer_name' => null,
            'customer_phone' => null,
            'warranty_period' => null,
            'warranty_unit' => null,
            'customer_warranty_expiry' => null,
        ]);
    }
}
