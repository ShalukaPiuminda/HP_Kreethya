<?php

namespace App\Services\Sms;

use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * Thin client for the Notify.lk SMS gateway (https://notify.lk).
 */
class NotifyLkClient
{
    /**
     * Normalise a Sri Lankan number to 94XXXXXXXXX. Returns null when it cannot be used.
     */
    public static function normalisePhone(?string $phone): ?string
    {
        $digits = preg_replace('/\D+/', '', (string) $phone);

        if ($digits === '') {
            return null;
        }
        if (str_starts_with($digits, '0094')) {
            $digits = substr($digits, 2);
        }
        if (strlen($digits) === 10 && str_starts_with($digits, '0')) {
            $digits = '94'.substr($digits, 1);
        }
        if (strlen($digits) === 9) {
            $digits = '94'.$digits;
        }

        return preg_match('/^94\d{9}$/', $digits) ? $digits : null;
    }

    public function isConfigured(): bool
    {
        $config = config('services.notifylk');

        return filled($config['url']) && filled($config['user_id']) && filled($config['api_key']) && filled($config['sender_id']);
    }

    /**
     * @return array{ok: bool, response: string}
     */
    public function send(string $phone, string $message): array
    {
        if (!$this->isConfigured()) {
            return ['ok' => false, 'response' => 'Notify.lk credentials are missing in .env.'];
        }

        $config = config('services.notifylk');
        $payload = [
            'user_id' => $config['user_id'],
            'api_key' => $config['api_key'],
            'sender_id' => $config['sender_id'],
            'to' => $phone,
            'message' => $message,
        ];
        // Sinhala / Tamil text must be sent as unicode.
        if (preg_match('/[^\x00-\x7F]/', $message)) {
            $payload['type'] = 'unicode';
        }

        try {
            $request = Http::asForm()->timeout($config['timeout'] ?? 10);
            if (filled($config['ca_bundle'] ?? null)) {
                $request = $request->withOptions(['verify' => $config['ca_bundle']]);
            }
            $response = $request->post($config['url'], $payload);

            return [
                'ok' => $response->successful() && $response->json('status') === 'success',
                'response' => mb_substr($response->body(), 0, 1000),
            ];
        } catch (Throwable $e) {
            return ['ok' => false, 'response' => mb_substr($e->getMessage(), 0, 1000)];
        }
    }
}
