<?php

namespace App\Console\Commands;

use App\Models\THirePurchaseSum;
use App\Models\THpInstallmentPayment;
use App\Models\TInstalment;
use Carbon\Carbon;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * One-off fix: agreements created while the due day defaulted to "1" got
 * schedules like Oct 28 sale -> Nov 1, Dec 1... This realigns them to the
 * agreement date's day (Oct 28 -> Nov 28, Dec 28...).
 *
 * Only touches agreements with NO payments, discounts or penalties recorded,
 * and never opening (imported) agreements. Amounts are not changed.
 *
 *   php artisan hp:realign-due-dates            # preview only
 *   php artisan hp:realign-due-dates --apply    # write changes
 *   php artisan hp:realign-due-dates --invoice=HP-HQ-20261102-0004 --apply
 */
class RealignHpDueDates extends Command
{
    protected $signature = 'hp:realign-due-dates
        {--apply : Write the changes (default is a dry-run preview)}
        {--invoice=* : Limit to these invoice numbers}';

    protected $description = 'Realign unpaid HP installment due dates to the agreement date\'s day of month';

    public function handle(): int
    {
        $apply = (bool) $this->option('apply');
        $invoices = (array) $this->option('invoice');

        $agreements = THirePurchaseSum::query()
            ->where('status', 'active')
            ->where(fn ($q) => $q->whereNull('is_opening')->orWhere('is_opening', false))
            ->when($invoices, fn ($q) => $q->whereIn('invoice_no', $invoices))
            ->orderBy('invoice_date')
            ->get();

        $changed = 0;
        $skipped = [];

        foreach ($agreements as $agreement) {
            $invoiceDate = Carbon::parse($agreement->invoice_date);
            $dueDay = $invoiceDate->day;

            $schedule = TInstalment::query()
                ->where('invoice_no', $agreement->invoice_no)
                ->orderBy('instalment_no')
                ->get();

            if ($schedule->isEmpty()) {
                continue;
            }

            $hasActivity = $schedule->contains(fn ($row) => (float) $row->amount_pay > 0
                    || (float) $row->discount > 0
                    || (float) $row->penalty_total_amount > 0)
                || THpInstallmentPayment::query()
                    ->whereIn('instalment_id', $schedule->pluck('id'))
                    ->exists();

            if ($hasActivity) {
                $skipped[] = [$agreement->invoice_no, 'has payments/discount/penalty'];
                continue;
            }

            $updates = [];
            foreach ($schedule as $row) {
                $month = $invoiceDate->copy()->addMonthsNoOverflow((int) $row->instalment_no);
                $newDate = $month->setDay(min($dueDay, $month->daysInMonth))->format('Y-m-d');
                $oldDate = $row->instalment_date->format('Y-m-d');
                if ($oldDate !== $newDate) {
                    $updates[$row->id] = [$oldDate, $newDate];
                }
            }

            if (! $updates && (int) $agreement->instalment_due_date === $dueDay) {
                continue;
            }

            $changed++;
            $first = $updates ? reset($updates) : null;
            $this->line(sprintf(
                '%s  %s  sale %s  due day %s -> %d  %s',
                $agreement->invoice_no,
                $agreement->agreement_no,
                $invoiceDate->format('Y-m-d'),
                $agreement->instalment_due_date,
                $dueDay,
                $first ? "#1 {$first[0]} -> {$first[1]} (".count($updates).' rows)' : '(dates already correct)'
            ));

            if ($apply) {
                DB::transaction(function () use ($agreement, $dueDay, $updates) {
                    foreach ($updates as $id => [, $newDate]) {
                        TInstalment::whereKey($id)->update(['instalment_date' => $newDate]);
                    }
                    $agreement->update(['instalment_due_date' => $dueDay]);
                });
            }
        }

        foreach ($skipped as [$invoice, $reason]) {
            $this->warn("SKIPPED {$invoice}: {$reason}");
        }

        $this->newLine();
        $this->info($apply
            ? "Updated {$changed} agreement(s)."
            : "{$changed} agreement(s) would change. Run again with --apply to save.");

        return self::SUCCESS;
    }
}
