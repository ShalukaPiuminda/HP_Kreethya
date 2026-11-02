<?php

namespace App\Services\Sms;

use App\Models\SmsLog;
use App\Models\THirePurchaseSum;
use App\Models\TInstalment;
use App\Models\User;
use App\Support\Features;

/**
 * Arrears and "due soon" reminders. Run daily by `sms:installment-reminders`,
 * and on demand from the SMS page.
 */
class InstallmentReminderService
{
    public function __construct(private readonly SmsService $sms)
    {
    }

    /**
     * @return array{arrears: array<string,int>, reminders: array<string,int>}
     */
    public function runDaily(): array
    {
        if (!Features::enabled(Features::SMS)) {
            return ['arrears' => [], 'reminders' => []];
        }

        return [
            'arrears' => $this->sendArrears(),
            'reminders' => $this->sendDueReminders(),
        ];
    }

    /**
     * One arrears SMS per overdue agreement, at most once every `arrears_repeat_days`.
     *
     * @return array<string,int> counts per status
     */
    public function sendArrears(?string $branchCode = null, ?User $user = null, bool $manual = false): array
    {
        $settings = $this->sms->settings();
        if (!$manual && !$settings['send_arrears']) {
            return [];
        }

        // A manual bulk send only skips customers already messaged today.
        $repeatDays = $manual ? 1 : max(1, (int) $settings['arrears_repeat_days']);
        $recentlyMessaged = SmsLog::query()
            ->whereIn('type', ['arrears', 'manual'])
            ->where('status', '!=', 'failed')
            ->where('created_at', '>=', today()->subDays($repeatDays - 1))
            ->whereNotNull('invoice_no')
            ->pluck('invoice_no')
            ->unique()
            ->all();

        $counts = [];
        $this->overdueAgreements($branchCode)
            ->reject(fn (THirePurchaseSum $agreement) => in_array($agreement->invoice_no, $recentlyMessaged, true))
            ->each(function (THirePurchaseSum $agreement) use (&$counts, $user, $manual) {
                $status = $this->sms->notifyArrears($agreement, $user, $manual);
                $counts[$status] = ($counts[$status] ?? 0) + 1;
            });

        return $counts;
    }

    /**
     * One reminder per installment due exactly `reminder_days_before` days from today.
     *
     * @return array<string,int> counts per status
     */
    public function sendDueReminders(): array
    {
        $settings = $this->sms->settings();
        $days = (int) $settings['reminder_days_before'];
        if (!$settings['send_reminder'] || $days < 1) {
            return [];
        }

        $alreadyReminded = SmsLog::query()
            ->where('type', 'reminder')
            ->where('status', '!=', 'failed')
            ->whereNotNull('instalment_id')
            ->where('created_at', '>=', today()->subDays($days + 1))
            ->pluck('instalment_id')
            ->all();

        $counts = [];
        TInstalment::query()
            ->whereIn('status', ['pending', 'partial'])
            ->whereDate('instalment_date', today()->addDays($days))
            ->where('balance_amount', '>', 0)
            ->whereNotIn('id', $alreadyReminded)
            ->with('sum')
            ->get()
            ->filter(fn (TInstalment $instalment) => $instalment->sum?->status === 'active')
            ->each(function (TInstalment $instalment) use (&$counts) {
                $status = $this->sms->notifyDueReminder($instalment, $instalment->sum);
                $counts[$status] = ($counts[$status] ?? 0) + 1;
            });

        return $counts;
    }

    private function overdueAgreements(?string $branchCode)
    {
        $overdueInvoices = TInstalment::query()
            ->whereIn('status', ['pending', 'partial'])
            ->whereDate('instalment_date', '<', today())
            ->where('balance_amount', '>', 0)
            ->when($branchCode, fn ($query) => $query->where('BC', $branchCode))
            ->distinct()
            ->pluck('invoice_no');

        return THirePurchaseSum::query()
            ->where('status', 'active')
            ->whereIn('invoice_no', $overdueInvoices)
            ->when($branchCode, fn ($query) => $query->where('BC', $branchCode))
            ->get();
    }
}
