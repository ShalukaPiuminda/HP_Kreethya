<?php

namespace App\Support;

/**
 * Sri Lankan NIC rules. Mirrors frontend/src/lib/nic.ts.
 *
 * Old format: 9 digits + V or X   e.g. 901234567V  (YY DDD SSS C + letter)
 * New format: 12 digits           e.g. 199012304567 (YYYY DDD 0SSS C)
 * DDD is the day of the year of birth (001-366), plus 500 for females.
 */
final class Nic
{
    public static function normalise(?string $value): string
    {
        return strtoupper((string) preg_replace('/\s+/', '', (string) $value));
    }

    public static function isValid(?string $value): bool
    {
        $nic = self::normalise($value);

        if (preg_match('/^\d{9}[VX]$/', $nic)) {
            $dayCode = (int) substr($nic, 2, 3);
        } elseif (preg_match('/^\d{12}$/', $nic)) {
            $year = (int) substr($nic, 0, 4);
            if ($year < 1900 || $year > (int) date('Y')) {
                return false;
            }
            $dayCode = (int) substr($nic, 4, 3);
        } else {
            return false;
        }

        $dayOfYear = $dayCode > 500 ? $dayCode - 500 : $dayCode;

        return $dayOfYear >= 1 && $dayOfYear <= 366;
    }
}
