<?php

namespace App\Services\Sms;

use App\Models\Company;
use App\Models\Customer;
use App\Models\SmsLog;
use App\Models\SystemFeature;
use App\Models\THirePurchaseSum;
use App\Models\TInstalment;
use App\Models\User;
use App\Support\Features;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Customer SMS notifications (paid "sms" feature). Every public notify* method
 * swallows errors so a failed SMS never breaks a payment.
 */
class SmsService
{
    public const DEFAULT_SETTINGS = [
        'company_name' => '',
        'send_payment' => true,
        'send_arrears' => true,
        'send_reminder' => true,
        'reminder_days_before' => 3,
        'arrears_repeat_days' => 7,
        'templates' => [
            'payment' => 'Dear {customer_name}, we received Rs.{paid_amount} for {invoice_no}. Balance: Rs.{balance}. Thank you - {company_name}',
            'invoice_payment' => 'Dear {customer_name}, we received Rs.{paid_amount} for {invoice_no}. Outstanding balance: Rs.{balance}. Thank you - {company_name}',
            'advance' => 'Dear {customer_name}, we received an advance payment of Rs.{paid_amount} (Ref {invoice_no}). Thank you - {company_name}',
            'arrears' => 'Dear {customer_name}, your installment for {invoice_no} of Rs.{arrears_amount} is overdue since {due_date}. Please settle soon - {company_name}',
            'reminder' => 'Dear {customer_name}, your installment of Rs.{amount} for {invoice_no} is due on {due_date} - {company_name}',
        ],
    ];

    public const PLACEHOLDERS = [
        '{customer_name}', '{invoice_no}', '{amount}', '{paid_amount}', '{balance}',
        '{due_date}', '{arrears_amount}', '{company_name}',
    ];

    public function __construct(private readonly NotifyLkClient $client)
    {
    }

    public function settings(): array
    {
        $stored = Features::settings(Features::SMS);
        $settings = array_replace(self::DEFAULT_SETTINGS, $stored);
        $settings['templates'] = array_replace(self::DEFAULT_SETTINGS['templates'], $stored['templates'] ?? []);

        return $settings;
    }

    public function saveSettings(array $settings): array
    {
        $current = $this->settings();
        $settings['templates'] = array_replace($current['templates'], $settings['templates'] ?? []);

        $feature = SystemFeature::firstOrCreate(['key' => Features::SMS]);
        $feature->settings = array_replace($current, $settings);
        $feature->save();

        return $this->settings();
    }

    public function isConfigured(): bool
    {
        return $this->client->isConfigured();
    }

    public function render(string $template, array $vars): string
    {
        $vars['company_name'] ??= $this->companyName();
        $replace = [];
        foreach ($vars as $key => $value) {
            $replace['{'.$key.'}'] = is_float($value) || is_int($value)
                ? number_format((float) $value, 2)
                : (string) $value;
        }

        return trim(strtr($template, $replace));
    }

    /**
     * Send one SMS and log it. Never throws.
     *
     * @return string sent|failed|skipped|disabled
     */
    public function send(string $type, ?string $phone, string $message, array $refs = [], ?User $user = null, bool $force = false): string
    {
        if (!$force && !Features::enabled(Features::SMS)) {
            return 'disabled';
        }

        try {
            $to = NotifyLkClient::normalisePhone($phone);
            if (!$to) {
                $this->log($type, $phone, $message, 'skipped', 'Invalid or missing phone number.', $refs, $user);

                return 'skipped';
            }

            $result = $this->client->send($to, $message);
            $status = $result['ok'] ? 'sent' : 'failed';
            $this->log($type, $to, $message, $status, $result['response'], $refs, $user);

            return $status;
        } catch (Throwable $e) {
            Log::warning('SMS send failed', ['type' => $type, 'error' => $e->getMessage()]);

            return 'failed';
        }
    }

    /**
     * Payment receipt for an HP agreement (installment, down payment or settlement).
     */
    public function notifyHpPayment(THirePurchaseSum $agreement, float $paidAmount, User $user): string
    {
        return $this->guard(function () use ($agreement, $paidAmount, $user) {
            $settings = $this->settings();
            if (!$settings['send_payment'] || $paidAmount <= 0) {
                return 'disabled';
            }

            $message = $this->render($settings['templates']['payment'], [
                'customer_name' => $agreement->customer_name,
                'invoice_no' => $agreement->agreement_no ?: $agreement->invoice_no,
                'paid_amount' => $paidAmount,
                'amount' => $paidAmount,
                'balance' => (float) $agreement->outstanding_amount,
            ]);

            return $this->send('payment', $this->hpPhone($agreement), $message, [
                'invoice_no' => $agreement->invoice_no,
                'customer_code' => $agreement->customer_code,
                'customer_name' => $agreement->customer_name,
                'BC' => $agreement->BC,
            ], $user);
        });
    }

    /**
     * Payment receipt for sales invoice payments ("invoice_payment") and customer advances ("advance").
     */
    public function notifyCustomerPayment(string $template, string $customerCode, string $reference, float $paidAmount, float $balance, User $user): string
    {
        return $this->guard(function () use ($template, $customerCode, $reference, $paidAmount, $balance, $user) {
            $settings = $this->settings();
            if (!$settings['send_payment'] || $paidAmount <= 0) {
                return 'disabled';
            }

            $customer = Customer::query()->where('Code', $customerCode)->where('BC', $user->BC)->first();
            $message = $this->render($settings['templates'][$template], [
                'customer_name' => $customer?->name ?? '',
                'invoice_no' => $reference,
                'paid_amount' => $paidAmount,
                'amount' => $paidAmount,
                'balance' => $balance,
            ]);

            return $this->send($template === 'advance' ? 'advance' : 'payment', $customer?->phone, $message, [
                'invoice_no' => $reference,
                'customer_code' => $customerCode,
                'customer_name' => $customer?->name,
                'BC' => $user->BC,
            ], $user);
        });
    }

    /**
     * Arrears SMS for one agreement: total overdue balance and the oldest overdue date.
     */
    public function notifyArrears(THirePurchaseSum $agreement, ?User $user = null, bool $manual = false): string
    {
        return $this->guard(function () use ($agreement, $user, $manual) {
            $settings = $this->settings();
            if (!$manual && !$settings['send_arrears']) {
                return 'disabled';
            }

            $overdue = TInstalment::query()
                ->where('invoice_no', $agreement->invoice_no)
                ->where('BC', $agreement->BC)
                ->whereIn('status', ['pending', 'partial'])
                ->whereDate('instalment_date', '<', today())
                ->orderBy('instalment_date')
                ->get(['id', 'instalment_date', 'balance_amount']);
            if ($overdue->isEmpty()) {
                return 'skipped';
            }

            $arrears = round((float) $overdue->sum('balance_amount'), 2);
            $message = $this->render($settings['templates']['arrears'], [
                'customer_name' => $agreement->customer_name,
                'invoice_no' => $agreement->agreement_no ?: $agreement->invoice_no,
                'arrears_amount' => $arrears,
                'amount' => $arrears,
                'balance' => (float) $agreement->outstanding_amount,
                'due_date' => Carbon::parse($overdue->first()->instalment_date)->format('Y-m-d'),
            ]);

            return $this->send($manual ? 'manual' : 'arrears', $this->hpPhone($agreement), $message, [
                'invoice_no' => $agreement->invoice_no,
                'instalment_id' => $overdue->first()->id,
                'customer_code' => $agreement->customer_code,
                'customer_name' => $agreement->customer_name,
                'BC' => $agreement->BC,
            ], $user);
        });
    }

    public function notifyDueReminder(TInstalment $instalment, THirePurchaseSum $agreement): string
    {
        return $this->guard(function () use ($instalment, $agreement) {
            $settings = $this->settings();
            if (!$settings['send_reminder']) {
                return 'disabled';
            }

            $message = $this->render($settings['templates']['reminder'], [
                'customer_name' => $agreement->customer_name,
                'invoice_no' => $agreement->agreement_no ?: $agreement->invoice_no,
                'amount' => (float) $instalment->balance_amount,
                'balance' => (float) $agreement->outstanding_amount,
                'due_date' => Carbon::parse($instalment->instalment_date)->format('Y-m-d'),
            ]);

            return $this->send('reminder', $this->hpPhone($agreement), $message, [
                'invoice_no' => $agreement->invoice_no,
                'instalment_id' => $instalment->id,
                'customer_code' => $agreement->customer_code,
                'customer_name' => $agreement->customer_name,
                'BC' => $agreement->BC,
            ]);
        });
    }

    /**
     * Suffix appended to a payment response message so the cashier sees the SMS result.
     */
    public static function statusLabel(string $status): string
    {
        return match ($status) {
            'sent' => ' SMS sent to customer.',
            'failed' => ' SMS could not be sent (see SMS log).',
            'skipped' => ' SMS not sent: customer has no valid phone number.',
            default => '',
        };
    }

    private function hpPhone(THirePurchaseSum $agreement): ?string
    {
        if (NotifyLkClient::normalisePhone($agreement->customer_phone)) {
            return $agreement->customer_phone;
        }

        return Customer::query()
            ->where('Code', $agreement->customer_code)
            ->where('BC', $agreement->BC)
            ->value('phone');
    }

    private function companyName(): string
    {
        $configured = trim((string) ($this->settings()['company_name'] ?? ''));

        return $configured !== '' ? $configured : (string) (Company::query()->value('name') ?? config('app.name'));
    }

    private function guard(callable $callback): string
    {
        if (!Features::enabled(Features::SMS)) {
            return 'disabled';
        }

        try {
            return $callback();
        } catch (Throwable $e) {
            Log::warning('SMS notification failed', ['error' => $e->getMessage()]);

            return 'failed';
        }
    }

    private function log(string $type, ?string $phone, string $message, string $status, ?string $response, array $refs, ?User $user): void
    {
        SmsLog::create([
            'type' => $type,
            'phone' => $phone ? mb_substr($phone, 0, 20) : null,
            'message' => $message,
            'status' => $status,
            'response' => $response,
            'invoice_no' => $refs['invoice_no'] ?? null,
            'instalment_id' => $refs['instalment_id'] ?? null,
            'customer_code' => $refs['customer_code'] ?? null,
            'customer_name' => $refs['customer_name'] ?? null,
            'BC' => $refs['BC'] ?? $user?->BC,
            'sent_by' => $user?->username ?? 'system',
        ]);
    }
}
