<?php

namespace App\Services;

use App\Models\SerialSequence;
use App\Models\TItemSerialMovement;

class SerialNumberService
{
    private const PAD_LENGTH = 6;

    /**
     * Issues $count unique serial numbers for an item, e.g. ITM0012-000045.
     * Must be called inside the caller's DB transaction so the counter lock
     * is held until the serials are written to the ledger.
     *
     * @return list<string>
     */
    public function generate(string $itemCode, string $BC, int $count): array
    {
        if ($count <= 0) {
            return [];
        }

        SerialSequence::query()->firstOrCreate(
            ['BC' => $BC, 'item_code' => $itemCode],
            ['last_no' => 0]
        );

        $sequence = SerialSequence::query()
            ->where('BC', $BC)
            ->where('item_code', $itemCode)
            ->lockForUpdate()
            ->firstOrFail();

        $serials = [];
        $next = $sequence->last_no;

        while (count($serials) < $count) {
            $next++;
            $candidate = $itemCode.'-'.str_pad((string) $next, self::PAD_LENGTH, '0', STR_PAD_LEFT);

            // Skip numbers already used, e.g. typed in manually on an older GRN.
            $taken = TItemSerialMovement::query()
                ->where('bc', $BC)
                ->where('item_serial_no', $candidate)
                ->exists();

            if (! $taken) {
                $serials[] = $candidate;
            }
        }

        $sequence->forceFill(['last_no' => $next])->save();

        return $serials;
    }
}
