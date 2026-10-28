<?php

namespace App\Services;

use App\Models\Item;
use Carbon\Carbon;

class WarrantyService
{
    /**
     * Resolve the warranty stored on a sold line (sales invoice or hire purchase).
     * Only items flagged warranty_enabled can carry warranty; the line may untick it
     * or override the period, and the expiry is fixed from the sale date.
     *
     * @return array{warranty_enabled: bool, warranty_months: ?int, warranty_expiry_date: ?string}
     */
    public function resolveLineWarranty(Item $item, array $line, string $saleDate): array
    {
        $enabled = $item->warranty_enabled
            && (bool) ($line['warranty_enabled'] ?? true);
        $months = $enabled
            ? (int) ($line['warranty_months'] ?? $item->warranty_months ?? 0)
            : 0;

        if (! $enabled || $months <= 0) {
            return [
                'warranty_enabled' => false,
                'warranty_months' => null,
                'warranty_expiry_date' => null,
            ];
        }

        return [
            'warranty_enabled' => true,
            'warranty_months' => $months,
            'warranty_expiry_date' => Carbon::parse($saleDate)
                ->addMonthsNoOverflow($months)
                ->toDateString(),
        ];
    }
}
