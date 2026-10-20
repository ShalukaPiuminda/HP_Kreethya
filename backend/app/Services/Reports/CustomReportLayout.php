<?php

namespace App\Services\Reports;

use App\Models\BranchDel;
use App\Models\Company;
use App\Models\User;

/**
 * Per-report page layout: page size/orientation, header, footer and table colours.
 * Stored as JSON on custom_reports.layout; missing keys fall back to DEFAULTS.
 */
class CustomReportLayout
{
    public const PAGE_SIZES = ['A4', 'A3', 'A5', 'Letter', 'Legal'];
    public const ORIENTATIONS = ['auto', 'portrait', 'landscape'];
    public const MARGINS = ['narrow' => 6.0, 'normal' => 10.0, 'wide' => 15.0];
    public const FONT_SIZES = ['small' => 7.0, 'normal' => 8.0, 'large' => 9.0];
    public const ALIGNS = ['left', 'center'];
    public const TABLE_LINES = ['rows', 'grid', 'none'];
    public const MAX_TEXT = 500;

    public const DEFAULTS = [
        'page_size' => 'A4',
        'orientation' => 'auto',
        'margins' => 'normal',
        'font_size' => 'normal',
        // Long cell text continues on extra lines (rows grow) instead of being cut with "...".
        'wrap_text' => false,
        // Lines in the table: under each row, a full grid, or none.
        'table_lines' => 'rows',
        'header' => [
            'show_company' => true,
            'show_branch' => false,
            'text' => '',
            'align' => 'left',
            'show_filters' => true,
            // false: company block, header text, title and filters only on page 1 (PDF);
            // later pages start with the table's column headings.
            'repeat' => false,
        ],
        'footer' => [
            'text' => '',
            'show_generated' => true,
            'show_page_numbers' => true,
        ],
        'colors' => [
            'title' => '#0F172A',
            'header_bg' => '#F1F5F9',
            'header_text' => '#334155',
            'stripe_bg' => '#F8FAFC',
            'border' => '#E2E8F0',
        ],
    ];

    /** Merge with defaults, keeping only known keys and valid values. */
    public static function normalize(?array $input): array
    {
        $input ??= [];
        $d = self::DEFAULTS;

        $pick = fn ($value, array $allowed, $default) => in_array($value, $allowed, true) ? $value : $default;
        $bool = fn ($value, bool $default) => $value === null ? $default : filter_var($value, FILTER_VALIDATE_BOOL);
        $text = fn ($value) => mb_substr(trim(str_replace("\r", '', (string) ($value ?? ''))), 0, self::MAX_TEXT);
        $color = function ($value, string $default, bool $allowEmpty = false) {
            $value = strtoupper(trim((string) ($value ?? '')));
            if ($value === '' && $allowEmpty) {
                return '';
            }
            return preg_match('/^#[0-9A-F]{6}$/', $value) ? $value : $default;
        };

        $header = (array) ($input['header'] ?? []);
        $footer = (array) ($input['footer'] ?? []);
        $colors = (array) ($input['colors'] ?? []);

        return [
            'page_size' => $pick($input['page_size'] ?? null, self::PAGE_SIZES, $d['page_size']),
            'orientation' => $pick($input['orientation'] ?? null, self::ORIENTATIONS, $d['orientation']),
            'margins' => $pick($input['margins'] ?? null, array_keys(self::MARGINS), $d['margins']),
            'font_size' => $pick($input['font_size'] ?? null, array_keys(self::FONT_SIZES), $d['font_size']),
            'wrap_text' => $bool($input['wrap_text'] ?? null, $d['wrap_text']),
            'table_lines' => $pick($input['table_lines'] ?? null, self::TABLE_LINES, $d['table_lines']),
            'header' => [
                'show_company' => $bool($header['show_company'] ?? null, $d['header']['show_company']),
                'show_branch' => $bool($header['show_branch'] ?? null, $d['header']['show_branch']),
                'text' => $text($header['text'] ?? ''),
                'align' => $pick($header['align'] ?? null, self::ALIGNS, $d['header']['align']),
                'show_filters' => $bool($header['show_filters'] ?? null, $d['header']['show_filters']),
                'repeat' => $bool($header['repeat'] ?? null, $d['header']['repeat']),
            ],
            'footer' => [
                'text' => $text($footer['text'] ?? ''),
                'show_generated' => $bool($footer['show_generated'] ?? null, $d['footer']['show_generated']),
                'show_page_numbers' => $bool($footer['show_page_numbers'] ?? null, $d['footer']['show_page_numbers']),
            ],
            'colors' => [
                'title' => $color($colors['title'] ?? null, $d['colors']['title']),
                'header_bg' => $color($colors['header_bg'] ?? null, $d['colors']['header_bg']),
                'header_text' => $color($colors['header_text'] ?? null, $d['colors']['header_text']),
                'stripe_bg' => array_key_exists('stripe_bg', $colors)
                    ? $color($colors['stripe_bg'], $d['colors']['stripe_bg'], allowEmpty: true)
                    : $d['colors']['stripe_bg'],
                'border' => $color($colors['border'] ?? null, $d['colors']['border']),
            ],
        ];
    }

    /** Company (first company, as on invoices), the user's branch, and who is generating the report. */
    public static function branding(User $user): array
    {
        $company = Company::query()->orderBy('id')->first();
        $branch = BranchDel::query()->where('bccode', $user->BC)->first();

        return [
            'company' => [
                'name' => (string) ($company->name ?? ''),
                'address' => (string) ($company->address ?? ''),
                'phone' => (string) ($company->phone ?? ''),
                'email' => (string) ($company->email ?? ''),
            ],
            'branch' => [
                'code' => (string) $user->BC,
                'name' => (string) ($branch->name ?? $user->BC),
            ],
            'user' => (string) ($user->username ?? ''),
        ];
    }

    /** Replace {company}, {branch}, {date} and {user} in header/footer text. */
    public static function fillPlaceholders(string $text, array $branding): string
    {
        return strtr($text, [
            '{company}' => $branding['company']['name'] ?? '',
            '{branch}' => $branding['branch']['name'] ?? '',
            '{date}' => now()->format('Y-m-d'),
            '{user}' => $branding['user'] ?? '',
        ]);
    }

    /** Company block lines for the header: name first, then address and contact details. */
    public static function companyLines(array $layout, array $branding): array
    {
        $lines = [];
        if ($layout['header']['show_company'] && ($branding['company']['name'] ?? '') !== '') {
            $company = $branding['company'];
            $lines[] = $company['name'];
            if ($company['address'] !== '') {
                $lines[] = preg_replace('/\s*\R\s*/', ', ', $company['address']);
            }
            $contact = implode('  ·  ', array_filter([
                $company['phone'] !== '' ? 'Tel: ' . $company['phone'] : '',
                $company['email'],
            ]));
            if ($contact !== '') {
                $lines[] = $contact;
            }
        }
        if ($layout['header']['show_branch'] && ($branding['branch']['name'] ?? '') !== '') {
            $lines[] = 'Branch: ' . $branding['branch']['name'];
        }

        return $lines;
    }

    /** Custom header/footer text split into lines, placeholders filled in. */
    public static function textLines(string $text, array $branding): array
    {
        if (trim($text) === '') {
            return [];
        }

        return array_values(array_filter(
            array_map('trim', explode("\n", self::fillPlaceholders($text, $branding))),
            fn ($line) => $line !== ''
        ));
    }

    public static function generatedText(array $branding): string
    {
        return 'Generated ' . now()->format('Y-m-d H:i') . (($branding['user'] ?? '') !== '' ? ' by ' . $branding['user'] : '');
    }

    public static function isLandscape(array $layout, int $columnCount): bool
    {
        return match ($layout['orientation']) {
            'landscape' => true,
            'portrait' => false,
            default => $columnCount > 6,
        };
    }

    public static function marginMm(array $layout): float
    {
        return self::MARGINS[$layout['margins']] ?? 10.0;
    }

    public static function fontPt(array $layout): float
    {
        return self::FONT_SIZES[$layout['font_size']] ?? 8.0;
    }

    /** "#RRGGBB" → [r, g, b] (for FPDF). */
    public static function rgb(string $hex): array
    {
        $hex = ltrim($hex, '#');

        return [hexdec(substr($hex, 0, 2)), hexdec(substr($hex, 2, 2)), hexdec(substr($hex, 4, 2))];
    }

    /** "#RRGGBB" → "RRGGBB" (for openspout). */
    public static function argb(string $hex): string
    {
        return strtoupper(ltrim($hex, '#'));
    }
}
