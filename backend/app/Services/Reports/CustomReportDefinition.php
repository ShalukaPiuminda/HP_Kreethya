<?php

namespace App\Services\Reports;

use App\Services\CustomReportService;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Normalising and checking a report definition (filters, columns, layout, SQL).
 * Shared by the Report Builder API and by report files, so both follow identical rules.
 */
class CustomReportDefinition
{
    /** Definition fields stored in report files and compared when syncing. */
    public const FIELDS = [
        'name', 'category', 'description', 'sql_query', 'parameters', 'columns', 'layout', 'is_published', 'sort_order',
    ];

    /** Clean a raw definition (from the API or a file) into the stored shape. */
    public static function normalize(array $raw): array
    {
        $category = trim((string) ($raw['category'] ?? ''));
        $description = trim((string) ($raw['description'] ?? ''));

        return [
            'name' => trim((string) ($raw['name'] ?? '')),
            'category' => $category !== '' ? $category : null,
            'description' => $description !== '' ? $description : null,
            'sql_query' => (string) ($raw['sql_query'] ?? ''),
            'parameters' => self::parameters(is_array($raw['parameters'] ?? null) ? $raw['parameters'] : []),
            'columns' => self::columns(is_array($raw['columns'] ?? null) ? $raw['columns'] : []),
            'layout' => CustomReportLayout::normalize(is_array($raw['layout'] ?? null) ? $raw['layout'] : null),
            'is_published' => (bool) ($raw['is_published'] ?? false),
            'sort_order' => (int) ($raw['sort_order'] ?? 0),
        ];
    }

    /**
     * Rules that need the SQL: dropdowns need a list, every :placeholder must be a filter,
     * and published reports must filter by branch (:bc).
     *
     * @throws ValidationException
     */
    public static function check(array $data, CustomReportService $service): void
    {
        if ($data['name'] === '') {
            throw ValidationException::withMessages(['name' => ['The report name is required.']]);
        }

        $withoutList = array_column(array_filter(
            $data['parameters'],
            fn ($param) => $param['type'] === 'select' && (!$param['source'] || ($param['source'] === 'list' && !$param['options']))
        ), 'name');
        if ($withoutList) {
            throw ValidationException::withMessages([
                'parameters' => ['Choose "Options from" for dropdown filter(s): ' . implode(', ', $withoutList) . '.'],
            ]);
        }

        $placeholders = $service->placeholders($data['sql_query']);
        $undeclared = array_diff($placeholders, [...array_column($data['parameters'], 'name'), 'bc']);
        if ($undeclared) {
            throw ValidationException::withMessages([
                'sql_query' => ['Undefined parameter(s): :' . implode(', :', $undeclared) . '. Add them to the parameters list.'],
            ]);
        }

        if ($data['is_published'] && !in_array('bc', $placeholders, true)) {
            throw ValidationException::withMessages([
                'sql_query' => ['Published reports must filter by branch using :bc (e.g. WHERE t.BC = :bc).'],
            ]);
        }
    }

    public static function columns(array $columns): array
    {
        return array_values(array_map(fn ($column) => [
            'key' => (string) $column['key'],
            'label' => $column['label'] ?? Str::headline((string) $column['key']),
            'align' => in_array($column['align'] ?? null, CustomReportService::COLUMN_ALIGNS, true) ? $column['align'] : 'left',
            'format' => in_array($column['format'] ?? null, CustomReportService::COLUMN_FORMATS, true) ? $column['format'] : 'text',
            // Show the column's sum over all matching rows in a "Total" row (number/money columns only).
            'total' => !empty($column['total']) && in_array($column['format'] ?? null, ['number', 'money'], true),
        ], array_filter($columns, fn ($column) => is_array($column) && !empty($column['key']))));
    }

    public static function parameters(array $parameters): array
    {
        return array_values(array_map(fn ($param) => [
            'name' => (string) ($param['name'] ?? ''),
            'label' => $param['label'] ?? Str::headline((string) ($param['name'] ?? '')),
            'type' => in_array($param['type'] ?? null, CustomReportService::PARAM_TYPES, true) ? $param['type'] : 'text',
            'required' => (bool) ($param['required'] ?? false),
            'default' => isset($param['default']) && $param['default'] !== '' ? (string) $param['default'] : null,
            'source' => in_array($param['source'] ?? null, CustomReportService::PARAM_SOURCES, true) ? $param['source'] : null,
            'options' => ($param['source'] ?? null) === 'list' ? self::listOptions($param['options'] ?? []) : [],
        ], array_filter($parameters, fn ($param) => is_array($param) && !empty($param['name']))));
    }

    /** Fixed-list options typed in by the developer: [{value, label}], blanks and duplicates removed. */
    public static function listOptions(mixed $options): array
    {
        $normalized = [];
        foreach (is_array($options) ? $options : [] as $option) {
            $value = trim((string) (is_array($option) ? ($option['value'] ?? '') : $option));
            if ($value === '' || isset($normalized[$value])) {
                continue;
            }
            $label = trim((string) (is_array($option) ? ($option['label'] ?? '') : ''));
            $normalized[$value] = ['value' => $value, 'label' => $label !== '' ? $label : $value];
        }

        return array_slice(array_values($normalized), 0, CustomReportService::MAX_LIST_OPTIONS);
    }
}
