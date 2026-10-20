<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\SystemFeature;
use App\Services\Sms\SmsService;
use App\Support\Features;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Vendor-only controls: switch paid features on/off and configure SMS.
 */
class DeveloperController extends BaseController
{
    public function __construct(private readonly SmsService $sms)
    {
    }

    /**
     * Enabled state for every logged-in user, so the UI can show lock badges.
     */
    public function enabledFeatures()
    {
        return $this->successResponse(Features::all());
    }

    public function features()
    {
        $stored = SystemFeature::query()->get()->keyBy('key');

        return $this->successResponse(collect(Features::ALL)->map(fn ($label, $key) => [
            'key' => $key,
            'label' => $label,
            'enabled' => (bool) ($stored[$key]->enabled ?? false),
            'enabled_at' => $stored[$key]->enabled_at ?? null,
            'enabled_by' => $stored[$key]->enabled_by ?? null,
        ])->values());
    }

    public function updateFeature(Request $request, string $key)
    {
        abort_unless(array_key_exists($key, Features::ALL), 404);
        $validated = $request->validate(['enabled' => ['required', 'boolean']]);

        $feature = SystemFeature::firstOrCreate(['key' => $key]);
        $feature->enabled = $validated['enabled'];
        $feature->enabled_at = $validated['enabled'] ? now() : null;
        $feature->enabled_by = $request->user()->username;
        $feature->save();
        Features::forget();

        return $this->successResponse(
            $feature,
            Features::ALL[$key].($validated['enabled'] ? ' enabled.' : ' disabled.')
        );
    }

    public function smsSettings()
    {
        return $this->successResponse([
            'settings' => $this->sms->settings(),
            'placeholders' => SmsService::PLACEHOLDERS,
            'gateway_configured' => $this->sms->isConfigured(),
        ]);
    }

    public function updateSmsSettings(Request $request)
    {
        $validated = $request->validate([
            'company_name' => ['nullable', 'string', 'max:60'],
            'send_payment' => ['required', 'boolean'],
            'send_arrears' => ['required', 'boolean'],
            'send_reminder' => ['required', 'boolean'],
            'reminder_days_before' => ['required', 'integer', 'between:1,30'],
            'arrears_repeat_days' => ['required', 'integer', 'between:1,60'],
            'templates' => ['required', 'array'],
            'templates.*' => ['required', 'string', 'max:480'],
        ]);
        $validated['company_name'] = (string) ($validated['company_name'] ?? '');
        $validated['templates'] = collect($validated['templates'])
            ->only(array_keys(SmsService::DEFAULT_SETTINGS['templates']))
            ->all();

        return $this->successResponse($this->sms->saveSettings($validated), 'SMS settings saved.');
    }

    public function testSms(Request $request)
    {
        $validated = $request->validate([
            'phone' => ['required', 'string', 'max:20'],
            'message' => ['required', 'string', 'max:480'],
        ]);

        $status = $this->sms->send('test', $validated['phone'], $validated['message'], [], $request->user(), true);

        return $status === 'sent'
            ? $this->successResponse(['status' => $status], 'Test SMS sent.')
            : $this->errorResponse(
                $status === 'skipped' ? 'Invalid phone number.' : 'Test SMS failed. Check the SMS log response for the gateway error.',
                422
            );
    }
}
