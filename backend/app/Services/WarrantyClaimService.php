<?php

namespace App\Services;

use App\Models\Item;
use App\Models\ItemBatch;
use App\Models\SerialWarranty;
use App\Models\User;
use App\Models\WarrantyClaim;
use App\Models\WarrantyClaimLog;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class WarrantyClaimService
{
    public const STATUSES = [
        'received',
        'sent_to_supplier',
        'returned_from_supplier',
        'in_service',
        'repaired',
        'replaced',
        'rejected',
        'closed',
        'cancelled',
    ];

    public const OPEN_STATUSES = ['received', 'sent_to_supplier', 'returned_from_supplier', 'in_service'];

    // 'in_service' is entered only through sendToService(); 'closed' is the handover to the customer.
    private const TRANSITIONS = [
        'received' => ['sent_to_supplier', 'in_service', 'repaired', 'replaced', 'rejected', 'cancelled'],
        'sent_to_supplier' => ['returned_from_supplier'],
        'returned_from_supplier' => ['in_service', 'repaired', 'replaced', 'rejected'],
        'in_service' => ['repaired', 'rejected', 'cancelled'],
        'repaired' => ['closed'],
        'replaced' => ['closed'],
        'rejected' => ['closed'],
        'closed' => [],
        'cancelled' => [],
    ];

    public function __construct(
        private readonly WarrantyService $warrantyService,
        private readonly StockService $stockService,
        private readonly ServiceTicketService $serviceTicketService
    ) {}

    /**
     * Opens a service ticket for the claimed unit (repair work, technician, supplier repair).
     * In-warranty claims become free warranty tickets; out-of-warranty claims are billed normally.
     */
    public function sendToService(WarrantyClaim $claim, array $data, User $user): WarrantyClaim
    {
        return DB::transaction(function () use ($claim, $data, $user) {
            $claim = WarrantyClaim::query()->whereKey($claim->id)->lockForUpdate()->firstOrFail();
            $from = $claim->status;

            if (! in_array('in_service', self::TRANSITIONS[$from] ?? [], true)) {
                throw ValidationException::withMessages([
                    'status' => 'Only received claims, or claims back from the supplier, can be sent to service.',
                ]);
            }

            $customerCode = $data['customer_code'] ?? $claim->customer_code;
            if (blank($customerCode)) {
                throw ValidationException::withMessages([
                    'customer_code' => 'Select the customer for the service ticket.',
                ]);
            }

            $ticket = $this->serviceTicketService->createTicket([
                'return_date' => $data['action_date'] ?? today()->toDateString(),
                'customer_code' => $customerCode,
                'item_code' => $claim->item_code,
                'item_serial_no' => $claim->item_serial_no,
                'problem_description' => $claim->fault_description,
                'intake_condition' => $claim->accessories_received
                    ? 'Accessories received: '.$claim->accessories_received
                    : null,
                'is_warranty' => $claim->is_within_warranty && $claim->serial_warranty_id !== null,
                'serial_warranty_id' => $claim->serial_warranty_id,
                'warranty_claim_id' => $claim->id,
                'expected_completion_date' => $data['expected_completion_date'] ?? null,
            ], $user);

            $claim->status = 'in_service';
            $claim->service_ticket_no = $ticket->ticket_no;
            $claim->UID = $user->username;
            $claim->save();

            $this->log(
                $claim,
                $from,
                'in_service',
                trim(($data['note'] ?? '').' Service ticket '.$ticket->ticket_no
                    .($ticket->is_warranty ? ' (free warranty repair).' : ' (out of warranty, billed to the customer).')),
                $user
            );

            return $this->load($claim);
        });
    }

    public function create(array $data, User $user): WarrantyClaim
    {
        return DB::transaction(function () use ($data, $user) {
            $item = Item::query()
                ->where('BC', $user->BC)
                ->where('item_code', $data['item_code'])
                ->firstOrFail();

            $serialNo = filled($data['item_serial_no'] ?? null) ? trim($data['item_serial_no']) : null;
            $qty = 1;

            if ($serialNo !== null) {
                $openClaim = WarrantyClaim::query()
                    ->where('BC', $user->BC)
                    ->where('item_code', $item->item_code)
                    ->where('item_serial_no', $serialNo)
                    ->whereIn('status', self::OPEN_STATUSES)
                    ->value('claim_no');

                if ($openClaim) {
                    throw ValidationException::withMessages([
                        'item_serial_no' => "Serial {$serialNo} already has an open claim ({$openClaim}).",
                    ]);
                }

                $warranty = SerialWarranty::query()
                    ->where('BC', $user->BC)
                    ->where('item_code', $item->item_code)
                    ->where('item_serial_no', $serialNo)
                    ->first();
            } else {
                // Non-serialized item: the claim is made against an invoice warranty line.
                $warranty = SerialWarranty::query()
                    ->where('BC', $user->BC)
                    ->where('item_code', $item->item_code)
                    ->whereNull('item_serial_no')
                    ->whereKey($data['serial_warranty_id'] ?? 0)
                    ->lockForUpdate()
                    ->first();

                if (! $warranty) {
                    throw ValidationException::withMessages([
                        'serial_warranty_id' => 'Select the invoice line this claim is for.',
                    ]);
                }

                $qty = max(1, (int) ($data['qty'] ?? 1));
                $claimable = $this->warrantyService->claimableQty($warranty);
                if ($qty > $claimable) {
                    throw ValidationException::withMessages([
                        'qty' => $claimable > 0
                            ? "Only {$claimable} unit(s) of this invoice line can be claimed."
                            : 'All units of this invoice line are returned or already in an open claim.',
                    ]);
                }
            }

            $claim = WarrantyClaim::create([
                'claim_no' => $this->nextNumber($user->BC),
                'claim_date' => $data['claim_date'],
                'item_code' => $item->item_code,
                'item_serial_no' => $serialNo,
                'qty' => $qty,
                'batch_no' => $warranty?->batch_no,
                'serial_warranty_id' => $warranty?->id,
                'sale_no' => $warranty?->sale_no,
                'customer_code' => $data['customer_code'] ?? $warranty?->customer_code,
                'customer_name' => $data['customer_name'] ?? $warranty?->customer_name,
                'customer_phone' => $data['customer_phone'] ?? $warranty?->customer_phone,
                'fault_description' => trim($data['fault_description']),
                'accessories_received' => $data['accessories_received'] ?? null,
                'is_within_warranty' => $this->warrantyService->customerWarrantyValid($warranty),
                'customer_warranty_expiry' => $warranty?->customer_warranty_expiry,
                'supplier_code' => $warranty?->supplier_code,
                'is_supplier_claimable' => $this->warrantyService->supplierWarrantyValid($warranty),
                'status' => 'received',
                'remarks' => $data['remarks'] ?? null,
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $this->log($claim, null, 'received', $data['remarks'] ?? null, $user);

            return $this->load($claim);
        });
    }

    public function update(WarrantyClaim $claim, array $data, User $user): WarrantyClaim
    {
        if (! in_array($claim->status, self::OPEN_STATUSES, true)) {
            throw ValidationException::withMessages(['status' => 'Only open claims can be edited.']);
        }

        $claim->fill(array_intersect_key($data, array_flip([
            'customer_name',
            'customer_phone',
            'fault_description',
            'accessories_received',
            'supplier_ref_no',
            'remarks',
        ])));
        $claim->UID = $user->username;
        $claim->save();

        return $this->load($claim);
    }

    public function changeStatus(WarrantyClaim $claim, array $data, User $user): WarrantyClaim
    {
        return DB::transaction(function () use ($claim, $data, $user) {
            $claim = WarrantyClaim::query()->whereKey($claim->id)->lockForUpdate()->firstOrFail();
            $from = $claim->status;
            $to = $data['status'];

            if (! in_array($to, self::TRANSITIONS[$from] ?? [], true)) {
                throw ValidationException::withMessages([
                    'status' => 'A claim cannot move from '.str_replace('_', ' ', $from).' to '.str_replace('_', ' ', $to).'.',
                ]);
            }

            switch ($to) {
                case 'in_service':
                    throw ValidationException::withMessages([
                        'status' => 'Use "Send to Service" to open a service ticket for this claim.',
                    ]);

                case 'cancelled':
                    if (blank($data['note'] ?? null)) {
                        throw ValidationException::withMessages([
                            'note' => 'Enter the reason for cancelling this claim.',
                        ]);
                    }
                    if ($claim->service_ticket_no) {
                        $this->serviceTicketService->deleteClaimTicket($claim->service_ticket_no, $user);
                        $claim->service_ticket_no = null;
                    }
                    $claim->cancel_reason = trim($data['note']);
                    break;

                case 'closed':
                    if (blank($data['handed_over_to'] ?? null)) {
                        throw ValidationException::withMessages([
                            'handed_over_to' => 'Enter who received the item.',
                        ]);
                    }
                    $claim->fill([
                        'handed_over_at' => $data['handed_over_at'] ?? now(),
                        'handed_over_to' => trim($data['handed_over_to']),
                        'handed_over_nic' => $data['handed_over_nic'] ?? null,
                        'handover_note' => $data['handover_note'] ?? null,
                        'handed_over_by' => $user->username,
                    ]);
                    // The claim is where a warranty repair is handed over; close its ticket too.
                    if ($claim->service_ticket_no) {
                        $this->serviceTicketService->handoverFromClaim($claim, $data, $user);
                    }
                    break;

                case 'sent_to_supplier':
                    if (! $claim->supplier_code) {
                        throw ValidationException::withMessages([
                            'status' => 'This unit has no supplier on record, so it cannot be sent to a supplier.',
                        ]);
                    }
                    $claim->sent_date = $data['action_date'] ?? today()->toDateString();
                    $claim->supplier_ref_no = $data['supplier_ref_no'] ?? $claim->supplier_ref_no;
                    break;

                case 'returned_from_supplier':
                    $claim->returned_date = $data['action_date'] ?? today()->toDateString();
                    $claim->supplier_ref_no = $data['supplier_ref_no'] ?? $claim->supplier_ref_no;
                    break;

                case 'repaired':
                case 'rejected':
                    $claim->resolution = $to;
                    break;

                case 'replaced':
                    $this->replaceUnit($claim, $data, $user);
                    $claim->resolution = 'replaced';
                    break;
            }

            $claim->status = $to;
            if (array_key_exists('remarks', $data) && filled($data['remarks'])) {
                $claim->remarks = $data['remarks'];
            }
            $claim->UID = $user->username;
            $claim->save();

            $this->log($claim, $from, $to, $data['note'] ?? null, $user);

            return $this->load($claim);
        });
    }

    public function load(WarrantyClaim $claim): WarrantyClaim
    {
        $claim->refresh()->load([
            'item:id,item_code,item_description,warranty_terms,is_batch',
            'supplier:id,Code,name,phone',
            'serialWarranty',
            'logs',
            'serviceTicket:id,ticket_no,status,is_warranty',
        ]);

        // Earlier and later claims on the same unit (serial, or the same invoice line).
        $claim->setAttribute('previous_claims', WarrantyClaim::query()
            ->where('BC', $claim->BC)
            ->where('item_code', $claim->item_code)
            ->whereKeyNot($claim->id)
            ->where(fn ($query) => $claim->item_serial_no !== null
                ? $query->where('item_serial_no', $claim->item_serial_no)
                : $query->where('serial_warranty_id', $claim->serial_warranty_id))
            ->orderByDesc('id')
            ->get(['id', 'claim_no', 'claim_date', 'qty', 'status', 'resolution', 'fault_description']));

        return $claim;
    }

    /**
     * Gives the customer a replacement unit from stock. The faulty unit can optionally be
     * taken back into the same store so it stays traceable (e.g. for return to supplier).
     */
    private function replaceUnit(WarrantyClaim $claim, array $data, User $user): void
    {
        $isSerialClaim = $claim->item_serial_no !== null;
        $newSerial = trim((string) ($data['replacement_serial_no'] ?? ''));
        $storeId = (int) ($data['store_id'] ?? 0);
        $qty = $isSerialClaim ? 1 : max(1, (int) $claim->qty);

        if (! $storeId || ($isSerialClaim && $newSerial === '')) {
            throw ValidationException::withMessages([
                'replacement_serial_no' => $isSerialClaim
                    ? 'Select the store and the replacement serial number.'
                    : 'Select the store to issue the replacement from.',
            ]);
        }

        if ($isSerialClaim && $newSerial === $claim->item_serial_no) {
            throw ValidationException::withMessages([
                'replacement_serial_no' => 'The replacement serial must be different from the faulty unit.',
            ]);
        }

        $item = Item::query()
            ->where('BC', $user->BC)
            ->where('item_code', $claim->item_code)
            ->firstOrFail();
        $batchNo = $item->is_batch ? ($data['batch_no'] ?? null) : null;

        if ($item->is_batch && ! $batchNo) {
            throw ValidationException::withMessages([
                'batch_no' => 'Select the batch to issue the replacement from.',
            ]);
        }

        // The faulty unit goes back into its original batch when known.
        $faultyBatchNo = $item->is_batch ? ($claim->batch_no ?: $batchNo) : null;

        try {
            $this->stockService->dispatchStock(
                $claim->claim_no,
                'WC-REPLACE',
                $item->item_code,
                $batchNo,
                $storeId,
                $qty,
                $user->BC,
                $user->username,
                $isSerialClaim ? [$newSerial] : null
            );

            if ($data['receive_faulty'] ?? true) {
                [$purchasePrice, $salesPrice] = $this->unitPrices($item, $faultyBatchNo, $storeId, $user->BC);

                $this->stockService->receiveStock(
                    $claim->claim_no,
                    'WC-FAULTY',
                    $item->item_code,
                    $faultyBatchNo,
                    $storeId,
                    $qty,
                    $purchasePrice,
                    $salesPrice,
                    $user->BC,
                    $user->username,
                    $isSerialClaim ? [$claim->item_serial_no] : null
                );
            }
        } catch (\InvalidArgumentException|\RuntimeException $exception) {
            throw ValidationException::withMessages([
                'replacement_serial_no' => $exception->getMessage(),
            ]);
        }

        // Non-serialized lines keep their warranty row: the customer still holds the same quantity.
        if ($isSerialClaim && $claim->serialWarranty) {
            $this->warrantyService->transferToReplacement($claim->serialWarranty, $newSerial, $user->username);
        }

        $claim->replacement_serial_no = $isSerialClaim ? $newSerial : null;
        $claim->store_id = $storeId;
    }

    private function unitPrices(Item $item, ?string $batchNo, int $storeId, string $BC): array
    {
        if ($item->is_batch && $batchNo) {
            $batch = ItemBatch::query()
                ->where('BC', $BC)
                ->where('item_code', $item->item_code)
                ->where('batch_no', $batchNo)
                ->where('store_id', $storeId)
                ->first();

            if ($batch) {
                return [(float) $batch->purchase_price, (float) $batch->sales_price];
            }
        }

        return [(float) $item->standard_purchase_price, (float) $item->standard_sales_price];
    }

    private function log(WarrantyClaim $claim, ?string $from, string $to, ?string $note, User $user): void
    {
        WarrantyClaimLog::create([
            'warranty_claim_id' => $claim->id,
            'from_status' => $from,
            'to_status' => $to,
            'note' => $note,
            'UID' => $user->username,
            'created_at' => now(),
        ]);
    }

    private function nextNumber(string $branchCode): string
    {
        $sequence = WarrantyClaim::query()
            ->where('BC', $branchCode)
            ->whereDate('created_at', today())
            ->lockForUpdate()
            ->count() + 1;

        return "WC-{$branchCode}-".now()->format('Ymd').'-'.str_pad($sequence, 4, '0', STR_PAD_LEFT);
    }
}
