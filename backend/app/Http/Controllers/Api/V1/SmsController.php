<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\Customer;
use App\Models\SmsLog;
use App\Models\THirePurchaseSum;
use App\Services\Sms\InstallmentReminderService;
use App\Services\Sms\SmsService;
use Illuminate\Http\Request;

class SmsController extends BaseController
{
    public function __construct(
        private readonly SmsService $sms,
        private readonly InstallmentReminderService $reminders
    ) {
    }

    public function logs(Request $request)
    {
        $logs = SmsLog::query()
            ->where('BC', $request->user()->BC)
            ->when($request->query('type'), fn ($query, string $type) => $query->where('type', $type))
            ->when($request->query('status'), fn ($query, string $status) => $query->where('status', $status))
            ->when($request->query('date_from'), fn ($query, string $date) => $query->whereDate('created_at', '>=', $date))
            ->when($request->query('date_to'), fn ($query, string $date) => $query->whereDate('created_at', '<=', $date))
            ->when($request->query('search'), function ($query, string $search) {
                $query->where(function ($nested) use ($search) {
                    $nested->where('invoice_no', 'like', "%{$search}%")
                        ->orWhere('customer_name', 'like', "%{$search}%")
                        ->orWhere('phone', 'like', "%{$search}%");
                });
            })
            ->orderByDesc('id')
            ->paginate(min(max((int) $request->integer('per_page', 50), 1), 200));

        return $this->paginatedResponse($logs, 'SMS log retrieved.');
    }

    public function sendArrears(Request $request, int $agreementId)
    {
        $agreement = THirePurchaseSum::query()
            ->whereKey($agreementId)
            ->where('BC', $request->user()->BC)
            ->firstOrFail();

        $status = $this->sms->notifyArrears($agreement, $request->user(), true);

        return match ($status) {
            'sent' => $this->successResponse(['status' => $status], 'Arrears SMS sent to customer.'),
            'skipped' => $this->errorResponse('SMS not sent: no overdue installments or no valid phone number.', 422),
            'disabled' => $this->errorResponse('SMS is not enabled.', 422),
            default => $this->errorResponse('SMS could not be sent. Check the SMS log for details.', 502),
        };
    }

    /**
     * Counts for the SMS page header (this branch).
     */
    public function summary(Request $request)
    {
        $base = SmsLog::query()->where('BC', $request->user()->BC);

        return $this->successResponse([
            'today_sent' => (clone $base)->whereDate('created_at', today())->where('status', 'sent')->count(),
            'today_failed' => (clone $base)->whereDate('created_at', today())->where('status', 'failed')->count(),
            'month_sent' => (clone $base)->where('created_at', '>=', today()->startOfMonth())->where('status', 'sent')->count(),
            'total' => (clone $base)->count(),
        ]);
    }

    /**
     * Customers with a phone number, for picking custom-message recipients.
     */
    public function customers(Request $request)
    {
        $search = trim((string) $request->query('search', ''));

        $customers = Customer::query()
            ->where('BC', $request->user()->BC)
            ->whereNotNull('phone')
            ->where('phone', '!=', '')
            ->when($search !== '', function ($query) use ($search) {
                $query->where(function ($nested) use ($search) {
                    $nested->where('name', 'like', "%{$search}%")
                        ->orWhere('Code', 'like', "%{$search}%")
                        ->orWhere('NIC', 'like', "%{$search}%")
                        ->orWhere('phone', 'like', "%{$search}%");
                });
            })
            ->orderBy('name')
            ->limit(20)
            ->get(['Code', 'name', 'phone']);

        return $this->successResponse($customers);
    }

    /**
     * Send a custom message to selected customers and/or typed phone numbers.
     * {customer_name} and {company_name} placeholders are filled per recipient.
     */
    public function sendCustom(Request $request)
    {
        $validated = $request->validate([
            'message' => ['required', 'string', 'max:480'],
            'customer_codes' => ['nullable', 'array', 'max:200'],
            'customer_codes.*' => ['string', 'distinct'],
            'phones' => ['nullable', 'array', 'max:50'],
            'phones.*' => ['string', 'max:20'],
        ]);

        $customers = Customer::query()
            ->where('BC', $request->user()->BC)
            ->whereIn('Code', $validated['customer_codes'] ?? [])
            ->get(['Code', 'name', 'phone']);
        $phones = collect($validated['phones'] ?? [])->map(fn ($phone) => trim($phone))->filter()->unique();

        if ($customers->isEmpty() && $phones->isEmpty()) {
            return $this->errorResponse('Select at least one customer or enter a phone number.', 422);
        }

        $counts = [];
        $count = function (string $status) use (&$counts) {
            $counts[$status] = ($counts[$status] ?? 0) + 1;
        };

        foreach ($customers as $customer) {
            $message = $this->sms->render($validated['message'], ['customer_name' => $customer->name]);
            $count($this->sms->send('custom', $customer->phone, $message, [
                'customer_code' => $customer->Code,
                'customer_name' => $customer->name,
                'BC' => $request->user()->BC,
            ], $request->user()));
        }
        foreach ($phones as $phone) {
            $message = $this->sms->render($validated['message'], ['customer_name' => 'Customer']);
            $count($this->sms->send('custom', $phone, $message, ['BC' => $request->user()->BC], $request->user()));
        }

        return $this->successResponse(
            $counts,
            sprintf(
                'Custom SMS: %d sent, %d failed, %d skipped (invalid number).',
                $counts['sent'] ?? 0,
                $counts['failed'] ?? 0,
                $counts['skipped'] ?? 0
            )
        );
    }

    /**
     * Send the same message again to the same number.
     */
    public function resend(Request $request, int $id)
    {
        $log = SmsLog::query()->whereKey($id)->where('BC', $request->user()->BC)->firstOrFail();

        $status = $this->sms->send($log->type, $log->phone, $log->message, [
            'invoice_no' => $log->invoice_no,
            'instalment_id' => $log->instalment_id,
            'customer_code' => $log->customer_code,
            'customer_name' => $log->customer_name,
            'BC' => $log->BC,
        ], $request->user());

        return match ($status) {
            'sent' => $this->successResponse(['status' => $status], 'SMS resent successfully.'),
            'skipped' => $this->errorResponse('SMS not sent: the phone number is invalid.', 422),
            'disabled' => $this->errorResponse('SMS is not enabled.', 422),
            default => $this->errorResponse('SMS could not be resent. Check the latest log entry for the gateway error.', 502),
        };
    }

    public function destroy(Request $request, int $id)
    {
        SmsLog::query()->whereKey($id)->where('BC', $request->user()->BC)->firstOrFail()->delete();

        return $this->successResponse(null, 'SMS log entry deleted.');
    }

    public function sendArrearsBulk(Request $request)
    {
        $counts = $this->reminders->sendArrears($request->user()->BC, $request->user(), true);
        $sent = $counts['sent'] ?? 0;
        $failed = $counts['failed'] ?? 0;
        $skipped = $counts['skipped'] ?? 0;

        return $this->successResponse(
            $counts,
            "Arrears SMS: {$sent} sent, {$failed} failed, {$skipped} skipped (no phone)."
        );
    }
}
