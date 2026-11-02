<?php

namespace App\Support;

use App\Models\SystemFeature;
use Illuminate\Support\Facades\Cache;

/**
 * Paid add-on features. Only the developer account can switch these on or off.
 */
class Features
{
    public const SMS = 'sms';

    public const ALL = [
        self::SMS => 'SMS Notifications',
    ];

    private const CACHE_KEY = 'system_features.enabled';

    public static function enabled(string $key): bool
    {
        return (bool) (self::all()[$key] ?? false);
    }

    /** @return array<string, bool> */
    public static function all(): array
    {
        $stored = Cache::rememberForever(self::CACHE_KEY, fn () => SystemFeature::query()
            ->pluck('enabled', 'key')
            ->map(fn ($enabled) => (bool) $enabled)
            ->all());

        return collect(self::ALL)
            ->map(fn ($label, $key) => (bool) ($stored[$key] ?? false))
            ->all();
    }

    public static function settings(string $key): array
    {
        return SystemFeature::query()->where('key', $key)->value('settings') ?? [];
    }

    public static function forget(): void
    {
        Cache::forget(self::CACHE_KEY);
    }
}
