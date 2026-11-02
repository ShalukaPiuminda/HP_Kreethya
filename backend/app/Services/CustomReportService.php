<?php

namespace App\Services;

use App\Models\User;
use App\Services\Reports\CustomReportLayout;
use App\Services\Reports\CustomReportPdfWriter;
use App\Services\Reports\CustomReportXlsxWriter;
use Carbon\Carbon;
use Illuminate\Database\Connection;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use PDO;
use Throwable;

/**
 * Runs developer-defined SQL reports safely.
 *
 * Safety layers:
 *  1. Static checks: single SELECT/WITH statement, no write/DDL keywords, no sensitive tables.
 *  2. Named parameters are converted to positional bindings (values are never interpolated).
 *  3. Execution happens inside a READ ONLY transaction that is always rolled back.
 *  4. Optional `reports_readonly` DB connection (SELECT-only MySQL user) when configured.
 *
 * Large reports: screens are paged server-side; exports stream rows (unbuffered) into the file.
 */
class CustomReportService
{
    public const DEFAULT_PER_PAGE = 100;
    public const MAX_PER_PAGE = 1000;

    /** Max rows per export file. Excel's sheet limit is 1,048,576; PDFs beyond ~200k rows are impractical to open. */
    public const EXPORT_LIMITS = ['xlsx' => 1000000, 'pdf' => 200000];

    private const EXPORT_SAMPLE_ROWS = 200;
    private const QUERY_TIMEOUT_MS = 30000;
    private const EXPORT_TIMEOUT_MS = 600000;

    public const PARAM_TYPES = ['date', 'text', 'number', 'select'];
    /**
     * Where "select" filters load their options from. Every list is limited to the user's branch (BC).
     * label: columns joined with " - "; where: extra whereIn filters.
     */
    public const FILTER_SOURCES = [
        'stores' => ['table' => 'stores', 'value' => 'id', 'label' => ['name']],
        'items' => ['table' => 'items', 'value' => 'item_code', 'label' => ['item_code', 'item_description']],
        'customers' => ['table' => 'customers', 'value' => 'Code', 'label' => ['name']],
        'suppliers' => ['table' => 'suppliers', 'value' => 'Code', 'label' => ['name']],
        'cash_accounts' => [
            'table' => 'm_chartof_accounts',
            'value' => 'code',
            'label' => ['code', 'description'],
            'where' => ['code' => [AccountingService::CASH, AccountingService::BANK]],
        ],
        'categories' => ['table' => 'categories', 'value' => 'id', 'label' => ['name']], // labels become full paths
        'brands' => ['table' => 'm_brands', 'value' => 'id', 'label' => ['name']],
        'makes' => ['table' => 'm__makes', 'value' => 'id', 'label' => ['name']],
        'colors' => ['table' => 'm_colors', 'value' => 'id', 'label' => ['name']],
        'departments' => ['table' => 'departments', 'value' => 'id', 'label' => ['name']],
        'areas' => ['table' => 'm_areas', 'value' => 'id', 'label' => ['name']],
        'routes' => ['table' => 'm_routes', 'value' => 'id', 'label' => ['name']],
        'salesmen' => ['table' => 'm_salesmen', 'value' => 'id', 'label' => ['name']],
        'schemas' => ['table' => 'm_schemas', 'value' => 'id', 'label' => ['SchemaType']],
        'banks' => ['table' => 'bank_details', 'value' => 'id', 'label' => ['bank_name', 'account_no']],
        'return_reasons' => ['table' => 'sales_return_reasons', 'value' => 'id', 'label' => ['reason']],
    ];

    /** Filter sources a parameter may use; "list" means options typed in by the developer. */
    public const PARAM_SOURCES = [
        'stores', 'items', 'customers', 'suppliers', 'cash_accounts', 'categories', 'brands', 'makes', 'colors',
        'departments', 'areas', 'routes', 'salesmen', 'schemas', 'banks', 'return_reasons', 'list',
    ];

    public const MAX_LIST_OPTIONS = 100;
    public const COLUMN_FORMATS = ['text', 'number', 'money', 'date'];
    public const COLUMN_ALIGNS = ['left', 'right', 'center'];

    private const FORBIDDEN_KEYWORDS = [
        'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE', 'RENAME',
        'GRANT', 'REVOKE', 'CALL', 'LOAD', 'LOAD_FILE', 'OUTFILE', 'DUMPFILE', 'INTO', 'LOCK', 'UNLOCK',
        'SET', 'HANDLER', 'SLEEP', 'BENCHMARK', 'PREPARE', 'EXECUTE', 'DEALLOCATE',
        'SHUTDOWN', 'KILL', 'FLUSH', 'RESET', 'PURGE', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'START',
    ];

    private const BLOCKED_TABLES = [
        'users', 'personal_access_tokens', 'password_reset_tokens', 'sessions', 'cache', 'cache_locks', 'jobs', 'failed_jobs',
    ];

    private const BLOCKED_SCHEMAS = ['information_schema', 'mysql', 'performance_schema', 'sys'];

    /**
     * Validate SQL and return [executableSql, placeholderNames].
     *
     * @throws ValidationException
     */
    public function compile(string $sql): array
    {
        [$exec, $scan, $placeholders] = $this->tokenize($sql);

        $exec = rtrim($exec, " \t\r\n;");
        $scan = rtrim($scan, " \t\r\n;");

        if ($scan === '') {
            $this->fail('SQL query is empty.');
        }
        if (str_contains($scan, ';')) {
            $this->fail('Only a single SQL statement is allowed.');
        }
        if (!preg_match('/^\(*\s*(SELECT|WITH)\b/i', $scan)) {
            $this->fail('The query must start with SELECT or WITH.');
        }

        // REPLACE()/INSERT() are also string functions, so only block them as statements.
        $keywords = implode('|', self::FORBIDDEN_KEYWORDS);
        if (preg_match('/\b(' . $keywords . ')\b/i', $scan, $match)
            || preg_match('/\b(INSERT|REPLACE)\b(?!\s*\()/i', $scan, $match)) {
            $this->fail('Keyword "' . strtoupper($match[1]) . '" is not allowed in report queries.');
        }

        $tables = implode('|', self::BLOCKED_TABLES);
        if (preg_match('/(?<![\w.])`?(' . $tables . ')`?(?![\w(])/i', $scan, $match)) {
            $this->fail('Table "' . $match[1] . '" cannot be used in reports.');
        }

        $schemas = implode('|', self::BLOCKED_SCHEMAS);
        if (preg_match('/(?<![\w.])`?(' . $schemas . ')`?\s*\./i', $scan, $match)) {
            $this->fail('Schema "' . $match[1] . '" cannot be used in reports.');
        }

        return [$exec, $placeholders];
    }

    /**
     * Placeholder names used in the SQL (after validation).
     */
    public function placeholders(string $sql): array
    {
        return array_values(array_unique($this->compile($sql)[1]));
    }

    /**
     * Run one page of a report.
     *
     * @param  array  $definition  ['sql_query' => string, 'parameters' => array, 'columns' => array]
     * @param  array  $input       raw parameter values from the request
     * @param  array  $options     page, per_page, sort, direction, with_count
     * @param  bool   $exposeErrors  show DB error text (developers only)
     */
    public function page(array $definition, User $user, array $input, array $options = [], bool $exposeErrors = false): array
    {
        [$sql, $bindings] = $this->prepare($definition, $user, $input);
        $columns = array_values($definition['columns'] ?? []);

        $page = max(1, (int) ($options['page'] ?? 1));
        $perPage = min(max(1, (int) ($options['per_page'] ?? self::DEFAULT_PER_PAGE)), self::MAX_PER_PAGE);
        $sort = ($options['sort'] ?? null) ?: null;
        $direction = strtolower((string) ($options['direction'] ?? 'asc')) === 'desc' ? 'desc' : 'asc';
        $withCount = (bool) ($options['with_count'] ?? true);
        $totalKeys = $options['total_keys'] ?? self::totalKeys($columns);

        $pageSql = $this->withLimit($this->applySort($sql, $columns, $sort, $direction), $perPage, ($page - 1) * $perPage);

        [$rows, $total, $totals] = $this->guard($exposeErrors, fn () => $this->readOnly(self::QUERY_TIMEOUT_MS, function (Connection $db) use ($pageSql, $sql, $bindings, $page, $perPage, $withCount, $totalKeys) {
            $rows = $db->select($pageSql, $bindings);
            $total = null;
            $totals = null;
            if ($withCount) {
                // A short first page already tells us the total; skip the COUNT query.
                $total = $page === 1 && count($rows) < $perPage ? count($rows) : $this->count($db, $sql, $bindings);
                // Totals change only with the filters, so they are sent along with the count.
                $totals = $this->totals($db, $sql, $bindings, $totalKeys, array_keys((array) ($rows[0] ?? [])));
            }

            return [$rows, $total, $totals];
        }));

        $rows = array_map(fn ($row) => (array) $row, $rows);
        $detected = $this->detectColumns($rows[0] ?? []);

        return [
            'columns' => $columns ?: $detected,
            'detected_columns' => $detected,
            'rows' => $rows,
            'page' => $page,
            'per_page' => $perPage,
            'total' => $total,
            'last_page' => $total === null ? null : max(1, (int) ceil($total / $perPage)),
            'totals' => $totals,
            'sort' => $sort,
            'direction' => $direction,
            'export_limits' => self::EXPORT_LIMITS,
            'generated_at' => now()->toDateTimeString(),
        ];
    }

    /**
     * Export every row of a report to a temporary .xlsx / .pdf file and return its path.
     *
     * Rows are streamed from MySQL with an unbuffered cursor straight into the file writer,
     * so memory use stays flat regardless of the row count.
     */
    public function export(
        array $definition,
        User $user,
        array $input,
        string $format,
        array $options,
        string $title,
        ?string $subtitle,
        bool $exposeErrors = false,
        array $layout = [],
        ?int $maxRows = null,
    ): string {
        if (!isset(self::EXPORT_LIMITS[$format])) {
            $this->fail('Unsupported export format.');
        }

        [$sql, $bindings] = $this->prepare($definition, $user, $input);
        $columns = array_values($definition['columns'] ?? []);
        $sort = ($options['sort'] ?? null) ?: null;
        $direction = strtolower((string) ($options['direction'] ?? 'asc')) === 'desc' ? 'desc' : 'asc';
        $sortedSql = $this->applySort($sql, $columns, $sort, $direction);
        if ($maxRows !== null) {
            // Test export from the builder: only the first rows, never refused for size.
            $sortedSql = $this->withLimit($sortedSql, $maxRows, 0);
        }
        $limit = self::EXPORT_LIMITS[$format];
        $layout = CustomReportLayout::normalize($layout);
        $branding = CustomReportLayout::branding($user);

        @set_time_limit(0);
        @ini_set('memory_limit', '1024M');

        $path = tempnam(sys_get_temp_dir(), 'custom-report-');
        $writer = $format === 'pdf' ? new CustomReportPdfWriter($path) : new CustomReportXlsxWriter($path);

        try {
            $this->guard($exposeErrors, fn () => $this->readOnly(self::EXPORT_TIMEOUT_MS, function (Connection $db) use ($sql, $sortedSql, $bindings, $limit, $format, $columns, $writer, $title, $subtitle, $layout, $branding, $maxRows) {
                $fullTotal = $this->count($db, $sql, $bindings);
                $total = $maxRows !== null ? min($fullTotal, $maxRows) : $fullTotal;
                if ($total > $limit) {
                    $this->fail(sprintf(
                        'This report has %s rows. %s export supports up to %s rows. Please narrow the filters%s.',
                        number_format($total),
                        $format === 'xlsx' ? 'Excel' : 'PDF',
                        number_format($limit),
                        $format === 'pdf' ? ' or export to Excel' : ''
                    ));
                }

                $sample = [];
                $started = false;
                $rowKeys = null;
                $start = function () use (&$sample, &$started, $writer, $columns, $title, $subtitle, $total, $layout, $branding) {
                    $writer->begin($title, $subtitle, $columns ?: $this->detectColumns($sample[0] ?? []), $sample, $total, $layout, $branding);
                    foreach ($sample as $row) {
                        $writer->write($row);
                    }
                    $sample = [];
                    $started = true;
                };

                $this->unbuffered($db, function () use ($db, $sortedSql, $bindings, &$sample, &$started, &$rowKeys, $start, $writer) {
                    foreach ($db->cursor($sortedSql, $bindings, false) as $row) {
                        if ($started) {
                            $writer->write((array) $row);
                            continue;
                        }
                        $sample[] = (array) $row;
                        $rowKeys ??= array_keys((array) $row);
                        if (count($sample) >= self::EXPORT_SAMPLE_ROWS) {
                            $start();
                        }
                    }
                });

                if (!$started) {
                    $start();
                }
                // Summed over the exported rows (a test export only sums its first rows).
                $totals = $this->totals($db, $sortedSql, $bindings, self::totalKeys($columns), $rowKeys ?? []);
                $writer->finish(match (true) {
                    $total === 0 => 'No rows match these filters.',
                    $fullTotal > $total => sprintf('Test export: first %s of %s rows.', number_format($total), number_format($fullTotal)),
                    default => null,
                }, $totals ?? []);
            }));
        } catch (Throwable $e) {
            @unlink($path);
            throw $e;
        }

        return $path;
    }

    /**
     * Options for "select" filters, only for the requested sources.
     *
     * @param  string[]  $sources
     * @return array<string, array<int, array{value: string, label: string}>>
     */
    public function filterOptions(User $user, array $sources): array
    {
        $result = [];
        foreach (array_unique($sources) as $source) {
            $definition = self::FILTER_SOURCES[$source] ?? null;
            if (!$definition) {
                continue;
            }
            $result[$source] = $source === 'categories'
                ? $this->categoryOptions($user)
                : $this->tableOptions($user, $definition);
        }

        return $result;
    }

    private function tableOptions(User $user, array $definition): array
    {
        $query = DB::table($definition['table'])
            ->where('BC', $user->BC)
            ->select(array_values(array_unique([$definition['value'], ...$definition['label']])))
            ->orderBy($definition['label'][0]);

        foreach ($definition['where'] ?? [] as $column => $values) {
            $query->whereIn($column, $values);
        }

        return $query->get()->map(fn ($row) => [
            'value' => (string) $row->{$definition['value']},
            'label' => implode(' - ', array_filter(
                array_map(fn ($column) => trim((string) ($row->{$column} ?? '')), $definition['label']),
                fn ($part) => $part !== ''
            )),
        ])->all();
    }

    /** Categories labelled with their full path, e.g. "Phones › Smart Phones". */
    private function categoryOptions(User $user): array
    {
        $rows = DB::table('categories')
            ->where('BC', $user->BC)
            ->get(['id', 'name', 'parent_id'])
            ->keyBy('id');

        $path = function ($id, array $seen = []) use (&$path, $rows): string {
            $row = $rows[$id] ?? null;
            if (!$row) {
                return '';
            }
            if (!$row->parent_id || isset($seen[$id]) || !isset($rows[$row->parent_id])) {
                return (string) $row->name;
            }

            return $path($row->parent_id, $seen + [$id => true]) . ' › ' . $row->name;
        };

        return $rows
            ->map(fn ($row) => ['value' => (string) $row->id, 'label' => $path($row->id)])
            ->sortBy('label', SORT_NATURAL | SORT_FLAG_CASE)
            ->values()
            ->all();
    }

    /** @return array{0: string, 1: array} executable SQL (no LIMIT) and positional bindings */
    private function prepare(array $definition, User $user, array $input): array
    {
        [$sql, $placeholders] = $this->compile((string) $definition['sql_query']);

        $values = $this->resolveParameters($definition['parameters'] ?? [], $input);
        $values['bc'] = $user->BC;

        $bindings = [];
        foreach ($placeholders as $name) {
            if (!array_key_exists($name, $values)) {
                $this->fail("Parameter :{$name} is used in the query but not defined.");
            }
            $bindings[] = $values[$name];
        }

        return [$sql, $bindings];
    }

    private function applySort(string $sql, array $columns, ?string $sort, string $direction): string
    {
        if ($sort === null) {
            return $sql;
        }
        if (str_contains($sort, '`') || mb_strlen($sort) > 100
            || ($columns && !in_array($sort, array_column($columns, 'key'), true))) {
            $this->fail('Unknown sort column.');
        }

        return "SELECT * FROM ({$sql}) AS custom_report_sorted ORDER BY `{$sort}` " . strtoupper($direction);
    }

    private function withLimit(string $sql, int $limit, int $offset): string
    {
        // A trailing LIMIT belongs to the developer; wrap it so paging applies on top.
        if (preg_match('/\bLIMIT\s+(\?|\d+)(\s*(,|OFFSET)\s*(\?|\d+))?\s*$/i', $sql)) {
            return "SELECT * FROM ({$sql}) AS custom_report_page LIMIT {$limit} OFFSET {$offset}";
        }

        return "{$sql} LIMIT {$limit} OFFSET {$offset}";
    }

    private function count(Connection $db, string $sql, array $bindings): int
    {
        return (int) ($db->selectOne("SELECT COUNT(*) AS aggregate FROM ({$sql}) AS custom_report_count", $bindings)->aggregate ?? 0);
    }

    /** Keys of the columns marked "Total". */
    public static function totalKeys(array $columns): array
    {
        return array_values(array_map(
            fn ($column) => $column['key'],
            array_filter($columns, fn ($column) => !empty($column['total']))
        ));
    }

    /**
     * Sum of each total column over every row of the query (not just one page).
     * Columns the query does not return are skipped; no rows gives zeros without a query.
     *
     * @param  string[]  $keys      columns marked "Total"
     * @param  string[]  $rowKeys   columns the query returned (empty when there are no rows)
     * @return array<string, float|int|string>|null  null when no column is marked "Total"
     */
    private function totals(Connection $db, string $sql, array $bindings, array $keys, array $rowKeys): ?array
    {
        if (!$keys) {
            return null;
        }
        if (!$rowKeys) {
            return array_fill_keys($keys, 0);
        }

        $keys = array_values(array_filter($keys, fn ($key) => in_array($key, $rowKeys, true) && !str_contains($key, '`')));
        if (!$keys) {
            return null;
        }

        $sums = implode(', ', array_map(fn ($key) => "COALESCE(SUM(`{$key}`), 0) AS `{$key}`", $keys));
        $row = (array) $db->selectOne("SELECT {$sums} FROM ({$sql}) AS custom_report_totals", $bindings);

        return array_map(fn ($value) => is_numeric($value) ? $value + 0 : $value, $row);
    }

    private function detectColumns(array $row): array
    {
        return array_map(fn ($key) => [
            'key' => (string) $key,
            'label' => Str::headline((string) $key),
            'align' => 'left',
            'format' => 'text',
        ], array_keys($row));
    }

    private function guard(bool $exposeErrors, callable $callback): mixed
    {
        try {
            return $callback();
        } catch (ValidationException $e) {
            throw $e;
        } catch (Throwable $e) {
            report($e);
            $this->fail($exposeErrors
                ? 'Query failed: ' . ($e instanceof QueryException ? ($e->errorInfo[2] ?? $e->getMessage()) : $e->getMessage())
                : 'This report could not be run. Please contact the system developer.');
        }
    }

    /** Stream result sets row by row instead of loading them into PHP memory first. */
    private function unbuffered(Connection $db, callable $callback): void
    {
        if (!in_array($db->getDriverName(), ['mysql', 'mariadb'], true)) {
            $callback();
            return;
        }

        $pdo = $db->getPdo();
        $pdo->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, false);
        try {
            $callback();
        } finally {
            $pdo->setAttribute(PDO::MYSQL_ATTR_USE_BUFFERED_QUERY, true);
        }
    }

    private function resolveParameters(array $parameters, array $input): array
    {
        $values = [];
        $errors = [];

        foreach ($parameters as $param) {
            $name = $param['name'];
            $raw = $input[$name] ?? null;
            if (is_array($raw) || $raw === null || $raw === '') {
                $raw = $param['default'] ?? null;
            }
            if ($raw === null || $raw === '') {
                if (!empty($param['required'])) {
                    $errors[$name] = [($param['label'] ?? $name) . ' is required.'];
                }
                $values[$name] = null;
                continue;
            }

            $raw = trim((string) $raw);
            switch ($param['type'] ?? 'text') {
                case 'date':
                    try {
                        $values[$name] = Carbon::parse($raw)->format('Y-m-d');
                    } catch (Throwable) {
                        $errors[$name] = [($param['label'] ?? $name) . ' must be a valid date.'];
                    }
                    break;
                case 'number':
                    if (!is_numeric($raw)) {
                        $errors[$name] = [($param['label'] ?? $name) . ' must be a number.'];
                    } else {
                        $values[$name] = $raw + 0;
                    }
                    break;
                default:
                    $values[$name] = mb_substr($raw, 0, 255);
            }
        }

        if ($errors) {
            throw ValidationException::withMessages($errors);
        }

        return $values;
    }

    private function readOnly(int $timeoutMs, callable $callback): mixed
    {
        $db = $this->connection();

        if ($db->transactionLevel() > 0) {
            // START TRANSACTION would implicitly commit the outer transaction.
            throw new \LogicException('Custom reports cannot run inside an open transaction.');
        }

        try {
            $db->statement('SET SESSION MAX_EXECUTION_TIME = ' . $timeoutMs);
        } catch (Throwable) {
            // MariaDB / older MySQL: no per-session SELECT timeout, continue without it.
        }

        $db->unprepared('START TRANSACTION READ ONLY');
        try {
            return $callback($db);
        } finally {
            try {
                $db->unprepared('ROLLBACK');
            } catch (Throwable) {
                // e.g. an unfinished unbuffered result; dropping the connection ends the transaction.
                $db->disconnect();
            }
        }
    }

    private function connection(): Connection
    {
        $name = config('database.connections.reports_readonly.username') ? 'reports_readonly' : null;

        return DB::connection($name);
    }

    /**
     * Walk the SQL once, outside of string literals and comments.
     * Returns [executableSql, scanSql (literals blanked), placeholderNames in order].
     */
    private function tokenize(string $sql): array
    {
        $len = strlen($sql);
        $exec = '';
        $scan = '';
        $placeholders = [];
        $i = 0;

        while ($i < $len) {
            $ch = $sql[$i];
            $next = $i + 1 < $len ? $sql[$i + 1] : '';

            if ($ch === "'" || $ch === '"') {
                $j = $i + 1;
                while ($j < $len) {
                    if ($sql[$j] === '\\') {
                        $j += 2;
                        continue;
                    }
                    if ($sql[$j] === $ch) {
                        if ($j + 1 < $len && $sql[$j + 1] === $ch) {
                            $j += 2;
                            continue;
                        }
                        break;
                    }
                    $j++;
                }
                if ($j >= $len) {
                    $this->fail('Unterminated string literal in SQL.');
                }
                $exec .= substr($sql, $i, $j - $i + 1);
                $scan .= "''";
                $i = $j + 1;
                continue;
            }

            if ($ch === '`') {
                $end = strpos($sql, '`', $i + 1);
                if ($end === false) {
                    $this->fail('Unterminated identifier in SQL.');
                }
                $identifier = substr($sql, $i, $end - $i + 1);
                $exec .= $identifier;
                $scan .= $identifier;
                $i = $end + 1;
                continue;
            }

            if ($ch === '#' || ($ch === '-' && $next === '-' && ($i + 2 >= $len || ctype_space($sql[$i + 2])))) {
                $end = strpos($sql, "\n", $i);
                $i = $end === false ? $len : $end;
                $exec .= ' ';
                $scan .= ' ';
                continue;
            }

            if ($ch === '/' && $next === '*') {
                // Also drops MySQL executable comments (/*! ... */) so they never run.
                $end = strpos($sql, '*/', $i + 2);
                if ($end === false) {
                    $this->fail('Unterminated comment in SQL.');
                }
                $i = $end + 2;
                $exec .= ' ';
                $scan .= ' ';
                continue;
            }

            if ($ch === ':' && ($i === 0 || $sql[$i - 1] !== ':')
                && preg_match('/\G:([A-Za-z_][A-Za-z0-9_]*)/', $sql, $match, 0, $i)) {
                $placeholders[] = $match[1];
                $exec .= '?';
                $scan .= '?';
                $i += strlen($match[0]);
                continue;
            }

            $exec .= $ch;
            $scan .= $ch;
            $i++;
        }

        return [trim($exec), trim($scan), $placeholders];
    }

    private function fail(string $message): never
    {
        throw ValidationException::withMessages(['sql_query' => [$message]]);
    }
}
