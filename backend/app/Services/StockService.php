<?php

namespace App\Services;

use App\Models\Item;
use App\Models\ItemBatch;
use App\Models\SerialEditAudit;
use App\Models\Store;
use App\Models\TItemMovement;
use App\Models\TItemSerialMovement;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StockService
{
    public function receiveStock(
        string $transNo,
        string $transCode,
        string $itemCode,
        ?string $batchNo,
        int $storeId,
        int $qty,
        float $purchasePrice,
        float $salesPrice,
        string $BC,
        string $UID,
        ?array $serialNumbers = null
    ): void {
        DB::transaction(function () use ($transNo, $transCode, $itemCode, $batchNo, $storeId, $qty, $purchasePrice, $salesPrice, $BC, $UID, $serialNumbers) {
            $item = $this->findBranchItem($itemCode, $BC);
            $this->findBranchStore($storeId, $BC);
            $this->validateTrackingRequirements($item, $batchNo, $qty, $serialNumbers);

            if ($item->is_serialized) {
                foreach ($serialNumbers ?? [] as $serialNo) {
                    if ($this->serialQuantity($itemCode, $serialNo, $BC) > 0) {
                        throw new \RuntimeException("Serial number {$serialNo} is already in stock.");
                    }
                }
            }

            if ($item->is_batch) {
                $batch = ItemBatch::where('batch_no', $batchNo)
                    ->where('item_code', $itemCode)
                    ->where('store_id', $storeId)
                    ->where('BC', $BC)
                    ->lockForUpdate()
                    ->first();

                if (!$batch) {
                    $batch = new ItemBatch([
                        'batch_no' => $batchNo,
                        'item_code' => $itemCode,
                        'store_id' => $storeId,
                        'qty_in_hand' => 0,
                        'BC' => $BC,
                    ]);
                }

                $batch->purchase_price = $purchasePrice;
                $batch->sales_price = $salesPrice;
                $batch->qty_in_hand = (int) $batch->qty_in_hand + $qty;
                $batch->UID = $UID;
                $batch->save();
            }

            $this->recordMovement(
                $transNo,
                $transCode,
                $item,
                $batchNo,
                $storeId,
                $qty,
                0,
                $BC,
                $UID,
                $serialNumbers
            );
        });
    }

    public function dispatchStock(
        string $transNo,
        string $transCode,
        string $itemCode,
        ?string $batchNo,
        int $storeId,
        int $qty,
        string $BC,
        string $UID,
        ?array $serialNumbers = null
    ): void {
        DB::transaction(function () use ($transNo, $transCode, $itemCode, $batchNo, $storeId, $qty, $BC, $UID, $serialNumbers) {
            $item = $this->findBranchItem($itemCode, $BC);
            $this->findBranchStore($storeId, $BC);
            $this->validateTrackingRequirements($item, $batchNo, $qty, $serialNumbers);

            if ($item->is_batch) {
                $batch = ItemBatch::where('batch_no', $batchNo)
                    ->where('item_code', $itemCode)
                    ->where('store_id', $storeId)
                    ->where('BC', $BC)
                    ->lockForUpdate()
                    ->firstOrFail();

                if ($batch->qty_in_hand < $qty) {
                    throw new \RuntimeException("Insufficient stock in batch {$batchNo}. Available: {$batch->qty_in_hand}, requested: {$qty}");
                }

                $batch->decrement('qty_in_hand', $qty);
            } else {
                $available = $this->storeQuantity($itemCode, $storeId, $BC);
                if ($available < $qty) {
                    throw new \RuntimeException("Insufficient stock. Available: {$available}, requested: {$qty}");
                }
            }

            if ($item->is_serialized) {
                foreach ($serialNumbers ?? [] as $serialNo) {
                    if ($this->serialQuantity($itemCode, $serialNo, $BC, $storeId) < 1) {
                        throw new \RuntimeException("Serial number {$serialNo} is not available in the selected store.");
                    }
                }
            }

            $this->recordMovement(
                $transNo,
                $transCode,
                $item,
                $batchNo,
                $storeId,
                0,
                $qty,
                $BC,
                $UID,
                $serialNumbers
            );
        });
    }

    public function getInventorySnapshot(string $BC, ?string $search = null): array
    {
        $items = Item::where('BC', $BC)
            ->when($search, function ($query, $search) {
                $query->where(function ($nested) use ($search) {
                    $nested->where('item_code', 'like', "%{$search}%")
                        ->orWhere('item_description', 'like', "%{$search}%");
                });
            })
            ->orderBy('item_code')
            ->get();

        $itemCodes = $items->pluck('item_code');

        $movementTotals = TItemMovement::query()
            ->selectRaw('item_code, store_id, SUM(qun_in) - SUM(qun_out) as qty_in_hand')
            ->where('BC', $BC)
            ->whereIn('item_code', $itemCodes)
            ->groupBy('item_code', 'store_id')
            ->get()
            ->groupBy('item_code');

        $batches = ItemBatch::where('BC', $BC)
            ->whereIn('item_code', $itemCodes)
            ->with('store')
            ->orderBy('batch_no')
            ->get()
            ->groupBy('item_code');

        $stores = Store::where('BC', $BC)->get()->keyBy('id');

        $serials = TItemSerialMovement::query()
            ->selectRaw('item_code, item_serial_no, store_id, SUM(qun_in) - SUM(qun_out) as qty_in_hand')
            ->where('bc', $BC)
            ->whereIn('item_code', $itemCodes)
            ->groupBy('item_code', 'item_serial_no', 'store_id')
            ->get()
            ->filter(fn (TItemSerialMovement $serial) => (int) $serial->qty_in_hand > 0)
            ->groupBy('item_code');

        return $items->map(function (Item $item) use ($movementTotals, $batches, $stores, $serials) {
            $itemBatches = $batches->get($item->item_code, collect());
            $itemSerials = $serials->get($item->item_code, collect())
                ->map(function ($serial) use ($stores) {
                    $store = $stores->get($serial->store_id);

                    return [
                        'serial_no' => $serial->item_serial_no,
                        'store_id' => (int) $serial->store_id,
                        'store_name' => $store?->name ?? 'Unknown Store',
                    ];
                })
                ->values();

            if ($item->is_batch) {
                $storeRows = $itemBatches
                    ->groupBy('store_id')
                    ->map(function ($storeBatches) {
                        $store = $storeBatches->first()->store;

                        return [
                            'store_id' => (int) $storeBatches->first()->store_id,
                            'store_name' => $store?->name ?? 'Unknown Store',
                            'location' => $store?->location,
                            'qty_in_hand' => (int) $storeBatches->sum('qty_in_hand'),
                        ];
                    })
                    ->values();

                $batchRows = $itemBatches->map(function (ItemBatch $batch) {
                    return [
                        'id' => $batch->id,
                        'batch_no' => $batch->batch_no,
                        'store_id' => (int) $batch->store_id,
                        'store_name' => $batch->store?->name ?? 'Unknown Store',
                        'purchase_price' => (float) $batch->purchase_price,
                        'sales_price' => (float) $batch->sales_price,
                        'qty_in_hand' => (int) $batch->qty_in_hand,
                        'stock_value' => round((float) $batch->purchase_price * (int) $batch->qty_in_hand, 2),
                    ];
                })->values();

                $totalQty = (int) $itemBatches->sum('qty_in_hand');
                $stockValue = round($batchRows->sum('stock_value'), 2);
            } else {
                $storeRows = $movementTotals->get($item->item_code, collect())
                    ->map(function ($movement) use ($stores) {
                        $store = $stores->get($movement->store_id);

                        return [
                            'store_id' => (int) $movement->store_id,
                            'store_name' => $store?->name ?? 'Unknown Store',
                            'location' => $store?->location,
                            'qty_in_hand' => (int) $movement->qty_in_hand,
                        ];
                    })
                    ->values();

                $batchRows = collect();
                $totalQty = (int) $storeRows->sum('qty_in_hand');
                $stockValue = round($totalQty * (float) $item->standard_purchase_price, 2);
            }

            return [
                'id' => $item->id,
                'item_code' => $item->item_code,
                'item_description' => $item->item_description,
                'is_batch' => (bool) $item->is_batch,
                'default_batch_price_mode' => (string) ($item->default_batch_price_mode ?: 'batch'),
                'is_serialized' => (bool) $item->is_serialized,
                'reorder_level' => (int) $item->reorder_level,
                'standard_purchase_price' => (float) $item->standard_purchase_price,
                'standard_sales_price' => (float) $item->standard_sales_price,
                'total_qty' => $totalQty,
                'stock_value' => $stockValue,
                'is_below_reorder' => $item->reorder_level > 0 && $totalQty <= $item->reorder_level,
                'stores' => $storeRows,
                'batches' => $batchRows,
                'available_serials' => $itemSerials,
            ];
        })->all();
    }

    public function getStockLevel(string $itemCode, string $BC): array
    {
        $stock = collect($this->getInventorySnapshot($BC, $itemCode))
            ->firstWhere('item_code', $itemCode);

        if (!$stock) {
            throw (new ModelNotFoundException())->setModel(Item::class, [$itemCode]);
        }

        return $stock;
    }

    public function getReorderAlerts(string $BC): array
    {
        return collect($this->getInventorySnapshot($BC))
            ->filter(fn (array $stock) => $stock['is_below_reorder'])
            ->map(fn (array $stock) => [
                ...$stock,
                'current_stock' => $stock['total_qty'],
                'deficit' => max(0, $stock['reorder_level'] - $stock['total_qty']),
            ])
            ->values()
            ->all();
    }

    public function generateTransNo(string $prefix, string $BC): string
    {
        $date = now()->format('Ymd');
        $last = TItemMovement::where('trans_code', $prefix)
            ->where('BC', $BC)
            ->whereDate('created_at', today())
            ->count();

        return "{$prefix}-{$BC}-{$date}-" . str_pad($last + 1, 4, '0', STR_PAD_LEFT);
    }

    public function transferStock(
        string $transNo,
        string $itemCode,
        ?string $batchNo,
        int $fromStoreId,
        int $toStoreId,
        int $qty,
        string $BC,
        string $UID,
        ?array $serialNumbers = null
    ): void {
        DB::transaction(function () use ($transNo, $itemCode, $batchNo, $fromStoreId, $toStoreId, $qty, $BC, $UID, $serialNumbers) {
            $item = $this->findBranchItem($itemCode, $BC);
            $this->findBranchStore($fromStoreId, $BC);
            $this->findBranchStore($toStoreId, $BC);
            $this->validateTrackingRequirements($item, $batchNo, $qty, $serialNumbers);

            $purchasePrice = (float) $item->standard_purchase_price;
            $salesPrice = (float) $item->standard_sales_price;

            if ($item->is_batch) {
                $sourceBatch = ItemBatch::where('batch_no', $batchNo)
                    ->where('item_code', $itemCode)
                    ->where('store_id', $fromStoreId)
                    ->where('BC', $BC)
                    ->lockForUpdate()
                    ->firstOrFail();
                $purchasePrice = (float) $sourceBatch->purchase_price;
                $salesPrice = (float) $sourceBatch->sales_price;
            }

            $this->dispatchStock(
                $transNo,
                'TRF-OUT',
                $itemCode,
                $batchNo,
                $fromStoreId,
                $qty,
                $BC,
                $UID,
                $serialNumbers
            );

            $this->receiveStock(
                $transNo,
                'TRF-IN',
                $itemCode,
                $batchNo,
                $toStoreId,
                $qty,
                $purchasePrice,
                $salesPrice,
                $BC,
                $UID,
                $serialNumbers
            );
        });
    }

    public function replaceReceivedSerials(
        string $transNo,
        string $transCode,
        string $itemCode,
        int $storeId,
        array $serialNumbers,
        string $BC,
        string $UID
    ): array {
        return DB::transaction(function () use ($transNo, $transCode, $itemCode, $storeId, $serialNumbers, $BC, $UID) {
            $item = $this->findBranchItem($itemCode, $BC);
            $this->findBranchStore($storeId, $BC);

            if (! $item->is_serialized) {
                throw ValidationException::withMessages([
                    'item_code' => 'Serial numbers can only be edited for serialized items.',
                ]);
            }

            $movementQty = (int) TItemMovement::query()
                ->where('trans_no', $transNo)
                ->where('trans_code', $transCode)
                ->where('item_code', $itemCode)
                ->where('store_id', $storeId)
                ->where('BC', $BC)
                ->lockForUpdate()
                ->get()
                ->sum(fn (TItemMovement $movement) => (int) $movement->qun_in);

            if ($movementQty <= 0) {
                throw ValidationException::withMessages([
                    'trans_no' => 'Inbound stock movement was not found for this branch and store.',
                ]);
            }

            $serialNumbers = collect($serialNumbers)
                ->map(fn ($serialNo) => trim((string) $serialNo))
                ->filter()
                ->values()
                ->all();

            if (count($serialNumbers) !== $movementQty) {
                throw ValidationException::withMessages([
                    'serial_numbers' => "Exactly {$movementQty} serial number(s) are required for this movement.",
                ]);
            }

            if (count(array_unique($serialNumbers)) !== $movementQty) {
                throw ValidationException::withMessages([
                    'serial_numbers' => 'Serial numbers must be unique.',
                ]);
            }

            $existingRows = TItemSerialMovement::query()
                ->where('trans_no', $transNo)
                ->where('trans_code', $transCode)
                ->where('item_code', $itemCode)
                ->where('store_id', $storeId)
                ->where('bc', $BC)
                ->where('qun_in', 1)
                ->where('qun_out', 0)
                ->lockForUpdate()
                ->get();
            $existingSerials = $existingRows->pluck('item_serial_no')->values()->all();

            if (count($existingSerials) !== $movementQty) {
                throw ValidationException::withMessages([
                    'serial_numbers' => 'The original serial movement rows do not match the received quantity.',
                ]);
            }

            foreach ($existingSerials as $serialNo) {
                if ($this->serialQuantity($itemCode, $serialNo, $BC, $storeId) < 1) {
                    throw ValidationException::withMessages([
                        'serial_numbers' => "Serial {$serialNo} is no longer available in this store and cannot be edited.",
                    ]);
                }
            }

            foreach (array_diff($serialNumbers, $existingSerials) as $serialNo) {
                if ($this->serialQuantity($itemCode, $serialNo, $BC) > 0) {
                    throw ValidationException::withMessages([
                        'serial_numbers' => "Serial {$serialNo} is already in stock.",
                    ]);
                }
            }

            TItemSerialMovement::query()
                ->whereKey($existingRows->pluck('id'))
                ->delete();

            foreach ($serialNumbers as $index => $serialNo) {
                $oldSerialNo = $existingSerials[$index] ?? null;
                if ($oldSerialNo === $serialNo) {
                    continue;
                }

                SerialEditAudit::create([
                    'source_type' => $transCode,
                    'source_no' => $transNo,
                    'item_code' => $item->item_code,
                    'store_id' => $storeId,
                    'old_serial_no' => $oldSerialNo,
                    'new_serial_no' => $serialNo,
                    'BC' => $BC,
                    'UID' => $UID,
                ]);
            }

            foreach ($serialNumbers as $serialNo) {
                TItemSerialMovement::create([
                    'trans_no' => $transNo,
                    'trans_code' => $transCode,
                    'item_code' => $item->item_code,
                    'item_description' => $item->item_description,
                    'item_serial_no' => $serialNo,
                    'qun_in' => 1,
                    'qun_out' => 0,
                    'store_id' => $storeId,
                    'dDate' => now(),
                    'bc' => $BC,
                    'UID' => $UID,
                ]);
            }

            return $serialNumbers;
        });
    }

    private function findBranchItem(string $itemCode, string $BC): Item
    {
        return Item::where('item_code', $itemCode)
            ->where('BC', $BC)
            ->lockForUpdate()
            ->firstOrFail();
    }

    private function findBranchStore(int $storeId, string $BC): Store
    {
        return Store::whereKey($storeId)
            ->where('BC', $BC)
            ->firstOrFail();
    }

    private function validateTrackingRequirements(
        Item $item,
        ?string $batchNo,
        int $qty,
        ?array $serialNumbers
    ): void {
        if ($item->is_batch && blank($batchNo)) {
            throw new \InvalidArgumentException('A batch number is required for batch-tracked items.');
        }

        if (!$item->is_batch && filled($batchNo)) {
            throw new \InvalidArgumentException('Batch numbers can only be used with batch-tracked items.');
        }

        if ($item->is_serialized) {
            if (count($serialNumbers ?? []) !== $qty) {
                throw new \InvalidArgumentException('The number of serial numbers must match the quantity.');
            }

            if (count(array_unique($serialNumbers ?? [])) !== $qty) {
                throw new \InvalidArgumentException('Serial numbers must be unique.');
            }
        } elseif (!empty($serialNumbers)) {
            throw new \InvalidArgumentException('Serial numbers can only be used with serialized items.');
        }
    }

    private function storeQuantity(string $itemCode, int $storeId, string $BC): int
    {
        return (int) TItemMovement::where('item_code', $itemCode)
            ->where('store_id', $storeId)
            ->where('BC', $BC)
            ->lockForUpdate()
            ->get()
            ->sum(fn (TItemMovement $movement) => $movement->qun_in - $movement->qun_out);
    }

    private function serialQuantity(string $itemCode, string $serialNo, string $BC, ?int $storeId = null): int
    {
        return (int) TItemSerialMovement::where('item_code', $itemCode)
            ->where('item_serial_no', $serialNo)
            ->where('bc', $BC)
            ->when($storeId, fn ($query) => $query->where('store_id', $storeId))
            ->get()
            ->sum(fn (TItemSerialMovement $movement) => $movement->qun_in - $movement->qun_out);
    }

    private function recordMovement(
        string $transNo,
        string $transCode,
        Item $item,
        ?string $batchNo,
        int $storeId,
        int $qtyIn,
        int $qtyOut,
        string $BC,
        string $UID,
        ?array $serialNumbers
    ): void {
        TItemMovement::create([
            'trans_no' => $transNo,
            'dDate' => now(),
            'trans_code' => $transCode,
            'item_code' => $item->item_code,
            'batch_no' => $batchNo,
            'store_id' => $storeId,
            'qun_in' => $qtyIn,
            'qun_out' => $qtyOut,
            'BC' => $BC,
            'UID' => $UID,
        ]);

        foreach ($serialNumbers ?? [] as $serialNo) {
            TItemSerialMovement::create([
                'trans_no' => $transNo,
                'trans_code' => $transCode,
                'item_code' => $item->item_code,
                'item_description' => $item->item_description,
                'item_serial_no' => $serialNo,
                'qun_in' => $qtyIn > 0 ? 1 : 0,
                'qun_out' => $qtyOut > 0 ? 1 : 0,
                'store_id' => $storeId,
                'dDate' => now(),
                'bc' => $BC,
                'UID' => $UID,
            ]);
        }
    }
}
