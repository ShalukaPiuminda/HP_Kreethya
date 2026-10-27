<?php

namespace App\Services;

use App\Models\Item;
use App\Models\ItemBatch;
use App\Models\PriceRevision;
use App\Models\PriceRevisionLine;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Manual sales / purchase price changes for item batches and standard prices.
 * Every change is stored as a revision with its old and new prices; saved revisions
 * are never edited, only reversed by a new revision that restores the old prices.
 */
class PriceRevisionService
{
    public const SCOPES = ['selected', 'store', 'all', 'standard'];
    public const PRICE_TYPES = ['sales', 'purchase', 'both'];
    public const METHODS = ['set', 'amount', 'percent'];

    /**
     * Work out the old and new prices without saving anything.
     * Each line carries its own validation errors so the screen can show them per row.
     */
    public function preview(array $data, User $user): array
    {
        $this->authorizePriceType($data['price_type'], $user);
        [$item, , $lines] = $this->plan($data, $user->BC, false);

        return [
            'item_code' => $item->item_code,
            'item_description' => $item->item_description,
            'lines' => $lines->values()->all(),
            'can_save' => $lines->isNotEmpty() && $lines->every(fn (array $line) => $line['errors'] === []),
        ];
    }

    public function create(array $data, User $user): PriceRevision
    {
        $this->authorizePriceType($data['price_type'], $user);

        return DB::transaction(function () use ($data, $user) {
            [$item, $batches, $lines] = $this->plan($data, $user->BC, true);

            if ($lines->isEmpty()) {
                throw ValidationException::withMessages(['scope' => 'No prices would change with these values.']);
            }

            $this->throwLineErrors($lines);

            $revision = PriceRevision::create([
                'revision_no' => $this->nextNumber($user->BC),
                'item_code' => $item->item_code,
                'scope' => $data['scope'],
                'store_id' => $data['scope'] === 'store' ? (int) $data['store_id'] : null,
                'price_type' => $data['price_type'],
                'method' => $data['method'],
                'sales_value' => $this->includesSales($data['price_type']) ? $data['sales_value'] : null,
                'purchase_value' => $this->includesPurchase($data['price_type']) ? $data['purchase_value'] : null,
                'update_standard' => $data['scope'] === 'standard',
                'reason' => $data['reason'],
                'source' => PriceRevision::SOURCE_MANUAL,
                'status' => PriceRevision::STATUS_APPLIED,
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $this->applyLines($revision, $item, $batches, $lines, $user->username);

            return $revision->load(['lines.store', 'item', 'store']);
        });
    }

    /**
     * Put back the old prices of an applied revision. Blocked when any of its prices
     * changed again afterwards, so a reversal never overwrites a newer change.
     */
    public function reverse(PriceRevision $revision, string $reason, User $user): PriceRevision
    {
        if (! $user->isSuperAdmin()) {
            throw new AuthorizationException('Only a Super Admin can reverse a price revision.');
        }

        return DB::transaction(function () use ($revision, $reason, $user) {
            $revision = PriceRevision::whereKey($revision->id)
                ->where('BC', $user->BC)
                ->lockForUpdate()
                ->firstOrFail();

            if ($revision->status !== PriceRevision::STATUS_APPLIED) {
                throw ValidationException::withMessages(['revision' => "{$revision->revision_no} has already been reversed."]);
            }

            if ($revision->source === PriceRevision::SOURCE_REVERSAL) {
                throw ValidationException::withMessages(['revision' => 'A reversal cannot be reversed. Create a new price revision instead.']);
            }

            $item = Item::where('item_code', $revision->item_code)
                ->where('BC', $user->BC)
                ->lockForUpdate()
                ->firstOrFail();

            $batches = ItemBatch::whereIn('id', $revision->lines()->whereNotNull('item_batch_id')->pluck('item_batch_id'))
                ->where('BC', $user->BC)
                ->lockForUpdate()
                ->with('store')
                ->get()
                ->keyBy('id');

            $lines = $revision->lines()->get()->map(function (PriceRevisionLine $line) use ($item, $batches) {
                [$currentPurchase, $currentSales] = $this->currentPrices($line, $item, $batches);

                if ($currentPurchase === null) {
                    throw ValidationException::withMessages(['revision' => "Batch {$line->batch_no} no longer exists, so this revision cannot be reversed."]);
                }

                if (! $this->samePrice($currentPurchase, (float) $line->new_purchase_price)
                    || ! $this->samePrice($currentSales, (float) $line->new_sales_price)) {
                    $label = $line->target === PriceRevisionLine::TARGET_STANDARD ? 'The standard price' : "Batch {$line->batch_no}";
                    throw ValidationException::withMessages([
                        'revision' => "{$label} has changed since this revision. Reverse the later revision first.",
                    ]);
                }

                return $this->line(
                    $item,
                    $line->target,
                    $line->target === PriceRevisionLine::TARGET_BATCH ? $batches->get($line->item_batch_id) : null,
                    $currentPurchase,
                    (float) $line->old_purchase_price,
                    $currentSales,
                    (float) $line->old_sales_price
                );
            });

            $this->throwLineErrors($lines);

            $reversal = PriceRevision::create([
                'revision_no' => $this->nextNumber($user->BC),
                'item_code' => $revision->item_code,
                'scope' => $revision->scope,
                'store_id' => $revision->store_id,
                'price_type' => $revision->price_type,
                'method' => 'restore',
                'update_standard' => $revision->update_standard,
                'reason' => $reason,
                'source' => PriceRevision::SOURCE_REVERSAL,
                'source_no' => $revision->revision_no,
                'status' => PriceRevision::STATUS_APPLIED,
                'reverses_id' => $revision->id,
                'BC' => $user->BC,
                'UID' => $user->username,
            ]);

            $this->applyLines($reversal, $item, $batches, $lines, $user->username);

            $revision->update([
                'status' => PriceRevision::STATUS_REVERSED,
                'reversed_by_revision_id' => $reversal->id,
                'reversed_by' => $user->username,
                'reversed_at' => now(),
            ]);

            return $reversal->load(['lines.store', 'item', 'store']);
        });
    }

    /**
     * Log a batch price change made by stock coming in (GRN / opening stock), so the
     * history covers every price change. Call inside the caller's transaction.
     */
    public function recordStockPriceChange(
        ItemBatch $batch,
        float $oldPurchasePrice,
        float $oldSalesPrice,
        string $source,
        string $sourceNo,
        string $UID
    ): void {
        $purchaseChanged = ! $this->samePrice($oldPurchasePrice, (float) $batch->purchase_price);
        $salesChanged = ! $this->samePrice($oldSalesPrice, (float) $batch->sales_price);

        if (! $purchaseChanged && ! $salesChanged) {
            return;
        }

        $revision = PriceRevision::create([
            'revision_no' => $this->nextNumber($batch->BC),
            'item_code' => $batch->item_code,
            'scope' => 'batch',
            'store_id' => $batch->store_id,
            'price_type' => $purchaseChanged && $salesChanged ? 'both' : ($salesChanged ? 'sales' : 'purchase'),
            'method' => 'set',
            'sales_value' => $salesChanged ? $batch->sales_price : null,
            'purchase_value' => $purchaseChanged ? $batch->purchase_price : null,
            'reason' => "Price updated by {$source} {$sourceNo}",
            'source' => $source,
            'source_no' => $sourceNo,
            'status' => PriceRevision::STATUS_APPLIED,
            'BC' => $batch->BC,
            'UID' => $UID,
        ]);

        $revision->lines()->create([
            'target' => PriceRevisionLine::TARGET_BATCH,
            'item_batch_id' => $batch->id,
            'batch_no' => $batch->batch_no,
            'store_id' => $batch->store_id,
            'old_purchase_price' => $oldPurchasePrice,
            'new_purchase_price' => $batch->purchase_price,
            'old_sales_price' => $oldSalesPrice,
            'new_sales_price' => $batch->sales_price,
        ]);
    }

    /**
     * @return array{0: Item, 1: Collection<int, ItemBatch>, 2: Collection<int, array>}
     */
    private function plan(array $data, string $BC, bool $lock): array
    {
        $item = Item::where('item_code', $data['item_code'])
            ->where('BC', $BC)
            ->when($lock, fn ($query) => $query->lockForUpdate())
            ->firstOrFail();

        $scope = $data['scope'];

        if (! $item->is_batch && $scope !== 'standard') {
            throw ValidationException::withMessages(['scope' => 'This item is not batch-tracked. Only its standard price can be revised.']);
        }

        // Batch items keep their prices on the batches; the item master always stores 0 as their standard price.
        if ($item->is_batch && ($scope === 'standard' || ! empty($data['update_standard']))) {
            throw ValidationException::withMessages(['scope' => 'Batch items have no standard price. Revise their batch prices instead.']);
        }

        $batches = $scope === 'standard'
            ? collect()
            : ItemBatch::where('item_code', $item->item_code)
                ->where('BC', $BC)
                ->when($scope === 'selected', fn ($query) => $query->whereIn('id', $data['batch_ids'] ?? []))
                ->when($scope === 'store', fn ($query) => $query->where('store_id', $data['store_id']))
                ->when($lock, fn ($query) => $query->lockForUpdate())
                ->with('store')
                ->orderBy('store_id')
                ->orderBy('batch_no')
                ->get()
                ->keyBy('id');

        if ($scope === 'selected' && $batches->count() !== count(array_unique($data['batch_ids'] ?? []))) {
            throw ValidationException::withMessages(['batch_ids' => 'One or more selected batches do not belong to this item in your branch.']);
        }

        if ($scope !== 'standard' && $batches->isEmpty()) {
            throw ValidationException::withMessages(['scope' => 'No batches found for this selection.']);
        }

        $lines = $batches->map(fn (ItemBatch $batch) => $this->line(
            $item,
            PriceRevisionLine::TARGET_BATCH,
            $batch,
            (float) $batch->purchase_price,
            $this->newPrice($data, 'purchase', (float) $batch->purchase_price),
            (float) $batch->sales_price,
            $this->newPrice($data, 'sales', (float) $batch->sales_price)
        ))->values();

        if ($scope === 'standard') {
            $lines->push($this->line(
                $item,
                PriceRevisionLine::TARGET_STANDARD,
                null,
                (float) $item->standard_purchase_price,
                $this->newPrice($data, 'purchase', (float) $item->standard_purchase_price),
                (float) $item->standard_sales_price,
                $this->newPrice($data, 'sales', (float) $item->standard_sales_price)
            ));
        }

        $lines = $lines->filter(fn (array $line) => $line['changed'])->values();

        return [$item, $batches, $lines];
    }

    private function line(
        Item $item,
        string $target,
        ?ItemBatch $batch,
        float $oldPurchase,
        float $newPurchase,
        float $oldSales,
        float $newSales
    ): array {
        $errors = [];

        if ($newPurchase < 0 || $newSales < 0) {
            $errors[] = 'Prices cannot be below zero.';
        }

        if ($newSales < $newPurchase) {
            $errors[] = 'Sales price '.$this->money($newSales).' is below purchase price '.$this->money($newPurchase).'.';
        }

        if ($item->sales_criteria_enabled) {
            if ($item->min_sales_price !== null && $newSales < (float) $item->min_sales_price) {
                $errors[] = 'Sales price is below the item minimum of '.$this->money((float) $item->min_sales_price).'.';
            }

            if ($item->max_sales_price !== null && $newSales > (float) $item->max_sales_price) {
                $errors[] = 'Sales price is above the item maximum of '.$this->money((float) $item->max_sales_price).'.';
            }
        }

        return [
            'target' => $target,
            'item_batch_id' => $batch?->id,
            'batch_no' => $batch?->batch_no,
            'store_id' => $batch?->store_id,
            'store_name' => $batch?->store?->name,
            'qty_in_hand' => $batch ? (int) $batch->qty_in_hand : null,
            'old_purchase_price' => round($oldPurchase, 2),
            'new_purchase_price' => round($newPurchase, 2),
            'old_sales_price' => round($oldSales, 2),
            'new_sales_price' => round($newSales, 2),
            'changed' => ! $this->samePrice($oldPurchase, $newPurchase) || ! $this->samePrice($oldSales, $newSales),
            'errors' => $errors,
        ];
    }

    private function applyLines(PriceRevision $revision, Item $item, Collection $batches, Collection $lines, string $UID): void
    {
        foreach ($lines as $line) {
            $revision->lines()->create([
                'target' => $line['target'],
                'item_batch_id' => $line['item_batch_id'],
                'batch_no' => $line['batch_no'],
                'store_id' => $line['store_id'],
                'old_purchase_price' => $line['old_purchase_price'],
                'new_purchase_price' => $line['new_purchase_price'],
                'old_sales_price' => $line['old_sales_price'],
                'new_sales_price' => $line['new_sales_price'],
            ]);

            if ($line['target'] === PriceRevisionLine::TARGET_STANDARD) {
                $item->standard_purchase_price = $line['new_purchase_price'];
                $item->standard_sales_price = $line['new_sales_price'];
                $item->UID = $UID;
                $item->save();
                continue;
            }

            $batch = $batches->get($line['item_batch_id']);
            $batch->purchase_price = $line['new_purchase_price'];
            $batch->sales_price = $line['new_sales_price'];
            $batch->UID = $UID;
            $batch->save();
        }
    }

    /**
     * @return array{0: ?float, 1: ?float} current [purchase, sales] of the line's target
     */
    private function currentPrices(PriceRevisionLine $line, Item $item, Collection $batches): array
    {
        if ($line->target === PriceRevisionLine::TARGET_STANDARD) {
            return [(float) $item->standard_purchase_price, (float) $item->standard_sales_price];
        }

        $batch = $batches->get($line->item_batch_id);

        return $batch ? [(float) $batch->purchase_price, (float) $batch->sales_price] : [null, null];
    }

    private function newPrice(array $data, string $field, float $old): float
    {
        $applies = $field === 'sales' ? $this->includesSales($data['price_type']) : $this->includesPurchase($data['price_type']);

        if (! $applies) {
            return $old;
        }

        $value = (float) $data[$field.'_value'];

        return round(match ($data['method']) {
            'set' => $value,
            'amount' => $old + $value,
            'percent' => $old * (1 + $value / 100),
        }, 2);
    }

    private function authorizePriceType(string $priceType, User $user): void
    {
        if ($this->includesPurchase($priceType) && ! $user->isSuperAdmin()) {
            throw new AuthorizationException('Only a Super Admin can change purchase prices.');
        }
    }

    private function throwLineErrors(Collection $lines): void
    {
        $messages = $lines
            ->filter(fn (array $line) => $line['errors'] !== [])
            ->map(function (array $line) {
                $label = $line['target'] === PriceRevisionLine::TARGET_STANDARD
                    ? 'Standard price'
                    : "Batch {$line['batch_no']} ({$line['store_name']})";

                return $label.': '.implode(' ', $line['errors']);
            })
            ->values()
            ->all();

        if ($messages !== []) {
            throw ValidationException::withMessages(['lines' => $messages]);
        }
    }

    private function includesSales(string $priceType): bool
    {
        return in_array($priceType, ['sales', 'both'], true);
    }

    private function includesPurchase(string $priceType): bool
    {
        return in_array($priceType, ['purchase', 'both'], true);
    }

    private function samePrice(float $a, float $b): bool
    {
        return abs(round($a, 2) - round($b, 2)) < 0.001;
    }

    private function money(float $value): string
    {
        return number_format($value, 2);
    }

    private function nextNumber(string $BC): string
    {
        $date = now()->format('Ymd');
        $base = "PR-{$BC}-{$date}-";
        $sequence = PriceRevision::query()
            ->where('revision_no', 'like', $base.'%')
            ->count() + 1;

        do {
            $number = $base.str_pad((string) $sequence, 4, '0', STR_PAD_LEFT);
            $sequence++;
        } while (PriceRevision::query()->where('revision_no', $number)->exists());

        return $number;
    }
}
