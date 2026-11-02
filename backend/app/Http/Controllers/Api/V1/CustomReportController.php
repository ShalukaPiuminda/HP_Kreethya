<?php

namespace App\Http\Controllers\Api\V1;

use App\Models\CustomReport;
use App\Services\CustomReportService;
use App\Services\Reports\CustomReportDefinition;
use App\Services\Reports\CustomReportFileStore;
use App\Services\Reports\CustomReportLayout;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class CustomReportController extends BaseController
{
    /** Rows included in the builder's Test PDF / Test Excel. */
    private const TEST_EXPORT_ROWS = 500;

    public function __construct(
        private readonly CustomReportService $service,
        private readonly CustomReportFileStore $files,
    ) {
    }

    // ─── Report Builder (developers) ─────────────────────────

    public function index()
    {
        $this->files->syncIfChanged();

        $reports = CustomReport::query()
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get()
            ->map(fn (CustomReport $report) => $this->withFileInfo($report));

        return $this->successResponse($reports);
    }

    public function show(int $id)
    {
        $this->files->syncIfChanged();

        return $this->successResponse($this->withFileInfo(CustomReport::findOrFail($id)));
    }

    public function store(Request $request)
    {
        $data = $this->validateDefinition($request);
        $user = $request->user();

        $report = CustomReport::create([
            ...$data,
            'slug' => $this->uniqueSlug($data['name']),
            'created_by' => $user->id,
            'updated_by' => $user->id,
            'BC' => $user->BC,
            'UID' => $user->username,
        ]);

        if ($this->files->canWrite()) {
            $this->files->write($report);
        }

        return $this->successResponse($this->withFileInfo($report), 'Report created successfully.', 201);
    }

    public function update(Request $request, int $id)
    {
        $report = CustomReport::findOrFail($id);
        $this->ensureEditable($report);
        $data = $this->validateDefinition($request);
        $previousSlug = $report->slug;

        if ($report->name !== $data['name']) {
            $data['slug'] = $this->uniqueSlug($data['name'], $report->id);
        }

        $report->update([
            ...$data,
            'updated_by' => $request->user()->id,
            'UID' => $request->user()->username,
        ]);

        if ($this->files->canWrite()) {
            $this->files->write($report, $previousSlug);
        }

        return $this->successResponse($this->withFileInfo($report->fresh()), 'Report updated successfully.');
    }

    public function destroy(int $id)
    {
        $report = CustomReport::findOrFail($id);
        $this->ensureEditable($report);
        $slug = $report->slug;
        $report->delete();

        if ($this->files->canWrite()) {
            $this->files->delete($slug);
        }

        return $this->successResponse(null, 'Report deleted successfully.');
    }

    /** On the server, reports that come from project files are view-only (the next deploy would overwrite edits). */
    private function ensureEditable(CustomReport $report): void
    {
        if (!$this->files->canWrite() && $this->files->isFileReport($report->slug)) {
            throw ValidationException::withMessages([
                'report' => ['This report comes from a project file (' . $this->files->displayPath($report->slug) . '). '
                    . 'Edit it on the development PC and deploy the updated file.'],
            ]);
        }
    }

    /** Adds from_file / file_path / files_writable so the builder knows what can be edited here. */
    private function withFileInfo(CustomReport $report): array
    {
        $fromFile = $this->files->isFileReport($report->slug);

        return [
            ...$report->toArray(),
            'from_file' => $fromFile,
            'file_path' => $fromFile ? $this->files->displayPath($report->slug) : null,
            'files_writable' => $this->files->canWrite(),
        ];
    }

    public function preview(Request $request)
    {
        $data = $request->validate([
            'sql_query' => ['required', 'string', 'max:20000'],
            'parameters' => ['nullable', 'array'],
            'columns' => ['nullable', 'array'],
            'values' => ['nullable', 'array'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'min:1', 'max:' . CustomReportService::MAX_PER_PAGE],
        ]);

        $result = $this->service->page(
            [
                'sql_query' => $data['sql_query'],
                'parameters' => CustomReportDefinition::parameters($data['parameters'] ?? []),
                'columns' => [],
            ],
            $request->user(),
            $data['values'] ?? [],
            [
                'page' => $data['page'] ?? 1,
                'per_page' => $data['per_page'] ?? CustomReportService::DEFAULT_PER_PAGE,
                'total_keys' => CustomReportService::totalKeys(CustomReportDefinition::columns($data['columns'] ?? [])),
            ],
            exposeErrors: true,
        );

        return $this->successResponse([...$result, 'branding' => CustomReportLayout::branding($request->user())]);
    }

    /**
     * Builder "Test PDF / Test Excel": the unsaved definition and layout, first 500 rows.
     */
    public function previewExport(Request $request)
    {
        $data = $request->validate([
            'sql_query' => ['required', 'string', 'max:20000'],
            'name' => ['nullable', 'string', 'max:150'],
            'parameters' => ['nullable', 'array'],
            'columns' => ['nullable', 'array'],
            'layout' => ['nullable', 'array'],
            'values' => ['nullable', 'array'],
            'subtitle' => ['nullable', 'string', 'max:500'],
            'format' => ['required', Rule::in(array_keys(CustomReportService::EXPORT_LIMITS))],
        ]);

        $path = $this->service->export(
            [
                'sql_query' => $data['sql_query'],
                'parameters' => CustomReportDefinition::parameters($data['parameters'] ?? []),
                'columns' => CustomReportDefinition::columns($data['columns'] ?? []),
            ],
            $request->user(),
            $data['values'] ?? [],
            $data['format'],
            [],
            ($data['name'] ?? '') ?: 'Report preview',
            $data['subtitle'] ?? null,
            exposeErrors: true,
            layout: $data['layout'] ?? [],
            maxRows: self::TEST_EXPORT_ROWS,
        );

        return $this->fileResponse($path, 'preview-' . (Str::slug($data['name'] ?? '') ?: 'report'), $data['format']);
    }

    // ─── Published reports (Reports tab) ─────────────────────

    public function published()
    {
        // New or changed report files (after a deploy) are loaded here, without any command.
        $this->files->syncIfChanged();

        $reports = CustomReport::query()
            ->where('is_published', true)
            ->orderBy('sort_order')
            ->orderBy('name')
            ->get(['id', 'name', 'slug', 'description', 'category', 'parameters', 'columns', 'layout']);

        // Resolve relative date defaults ("today", "first day of this month") for the filter inputs.
        $reports->each(function (CustomReport $report) {
            $report->layout = CustomReportLayout::normalize($report->layout);
            $report->parameters = array_map(function ($param) {
                if (($param['type'] ?? null) === 'date' && !empty($param['default'])) {
                    try {
                        $param['default'] = Carbon::parse($param['default'])->format('Y-m-d');
                    } catch (\Throwable) {
                        $param['default'] = null;
                    }
                }
                return $param;
            }, $report->parameters ?? []);
        });

        return $this->successResponse($reports);
    }

    /**
     * One page of a published report. Filter values are plain query params;
     * paging/sorting use underscore-prefixed params (_page, _per_page, _sort, _dir, _count).
     */
    public function run(Request $request, string $slug)
    {
        $this->files->syncIfChanged();
        $report = $this->publishedReport($slug);
        $options = $this->viewOptions($request);

        $result = $this->service->page(
            $report->only(['sql_query', 'parameters', 'columns']),
            $request->user(),
            $this->filterValues($request),
            [...$options, 'with_count' => $request->query('_count', '1') !== '0'],
            exposeErrors: $request->user()->isSuperAdmin(),
        );

        return $this->successResponse([
            ...$result,
            'report' => $report->only(['id', 'name', 'slug', 'description', 'category']),
            'layout' => CustomReportLayout::normalize($report->layout),
            'branding' => CustomReportLayout::branding($request->user()),
        ]);
    }

    /**
     * Download every row of a published report as Excel (_format=xlsx) or PDF (_format=pdf).
     */
    public function export(Request $request, string $slug)
    {
        $report = $this->publishedReport($slug);
        $request->validate([
            '_format' => ['required', Rule::in(array_keys(CustomReportService::EXPORT_LIMITS))],
            '_subtitle' => ['nullable', 'string', 'max:500'],
        ]);
        $format = $request->query('_format');

        $path = $this->service->export(
            $report->only(['sql_query', 'parameters', 'columns']),
            $request->user(),
            $this->filterValues($request),
            $format,
            $this->viewOptions($request),
            $report->name,
            $request->query('_subtitle') ?: $report->description,
            exposeErrors: $request->user()->isSuperAdmin(),
            layout: $report->layout ?? [],
        );

        return $this->fileResponse($path, $report->slug, $format);
    }

    private function fileResponse(string $path, string $baseName, string $format)
    {
        return response()->download($path, $baseName . '-' . now()->format('Ymd-His') . '.' . $format, [
            'Content-Type' => $format === 'pdf'
                ? 'application/pdf'
                : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ])->deleteFileAfterSend();
    }

    /**
     * Options for "select" filters: ?sources=categories,stores (only the lists a report uses).
     * Served on two routes: /v1/reports/filter-options (viewers) and /v1/report-builder/filter-options (developers).
     */
    public function filterOptions(Request $request)
    {
        $request->validate(['sources' => ['nullable', 'string', 'max:500']]);
        $sources = array_filter(array_map('trim', explode(',', (string) $request->query('sources', ''))));

        return $this->successResponse($this->service->filterOptions($request->user(), $sources));
    }

    private function publishedReport(string $slug): CustomReport
    {
        return CustomReport::query()
            ->where('slug', $slug)
            ->where('is_published', true)
            ->firstOrFail();
    }

    private function viewOptions(Request $request): array
    {
        $request->validate([
            '_page' => ['nullable', 'integer', 'min:1'],
            '_per_page' => ['nullable', 'integer', 'min:1', 'max:' . CustomReportService::MAX_PER_PAGE],
            '_sort' => ['nullable', 'string', 'max:100'],
            '_dir' => ['nullable', Rule::in(['asc', 'desc'])],
        ]);

        return [
            'page' => (int) $request->query('_page', 1),
            'per_page' => (int) $request->query('_per_page', CustomReportService::DEFAULT_PER_PAGE),
            'sort' => $request->query('_sort'),
            'direction' => $request->query('_dir', 'asc'),
        ];
    }

    /** Query params that are report filters (everything not prefixed with "_"). */
    private function filterValues(Request $request): array
    {
        return array_filter(
            $request->query(),
            fn ($key) => !str_starts_with((string) $key, '_'),
            ARRAY_FILTER_USE_KEY
        );
    }

    // ─── Helpers ─────────────────────────────────────────────

    private function validateDefinition(Request $request): array
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:150'],
            'description' => ['nullable', 'string', 'max:1000'],
            'category' => ['nullable', 'string', 'max:100'],
            'sql_query' => ['required', 'string', 'max:20000'],
            'is_published' => ['boolean'],
            'sort_order' => ['nullable', 'integer'],
            'parameters' => ['nullable', 'array'],
            'parameters.*.name' => ['required', 'string', 'max:50', 'regex:/^[a-z][a-z0-9_]*$/', 'not_in:bc', 'distinct'],
            'parameters.*.label' => ['nullable', 'string', 'max:100'],
            'parameters.*.type' => ['required', Rule::in(CustomReportService::PARAM_TYPES)],
            'parameters.*.required' => ['boolean'],
            'parameters.*.default' => ['nullable', 'string', 'max:255'],
            'parameters.*.source' => ['nullable', Rule::in(CustomReportService::PARAM_SOURCES)],
            'parameters.*.options' => ['nullable', 'array', 'max:' . CustomReportService::MAX_LIST_OPTIONS],
            'parameters.*.options.*.value' => ['nullable', 'string', 'max:100'], // blanks are dropped when saving
            'parameters.*.options.*.label' => ['nullable', 'string', 'max:150'],
            'columns' => ['nullable', 'array'],
            'columns.*.key' => ['required', 'string', 'max:100', 'distinct'],
            'columns.*.label' => ['nullable', 'string', 'max:100'],
            'columns.*.align' => ['nullable', Rule::in(CustomReportService::COLUMN_ALIGNS)],
            'columns.*.format' => ['nullable', Rule::in(CustomReportService::COLUMN_FORMATS)],
            'columns.*.total' => ['nullable', 'boolean'],
            'layout' => ['nullable', 'array'],
            'layout.page_size' => ['nullable', Rule::in(CustomReportLayout::PAGE_SIZES)],
            'layout.orientation' => ['nullable', Rule::in(CustomReportLayout::ORIENTATIONS)],
            'layout.margins' => ['nullable', Rule::in(array_keys(CustomReportLayout::MARGINS))],
            'layout.font_size' => ['nullable', Rule::in(array_keys(CustomReportLayout::FONT_SIZES))],
            'layout.wrap_text' => ['nullable', 'boolean'],
            'layout.table_lines' => ['nullable', Rule::in(CustomReportLayout::TABLE_LINES)],
            'layout.header.text' => ['nullable', 'string', 'max:' . CustomReportLayout::MAX_TEXT],
            'layout.header.align' => ['nullable', Rule::in(CustomReportLayout::ALIGNS)],
            'layout.header.repeat' => ['nullable', 'boolean'],
            'layout.footer.text' => ['nullable', 'string', 'max:' . CustomReportLayout::MAX_TEXT],
            'layout.colors.*' => ['nullable', 'string', 'regex:/^#[0-9A-Fa-f]{6}$/'],
        ], [
            'layout.colors.*.regex' => 'Colours must be in #RRGGBB format.',
            'parameters.*.name.regex' => 'Parameter names must start with a letter and may only contain lowercase letters, numbers and underscores.',
            'parameters.*.name.not_in' => ':bc is reserved for the branch code and is filled in automatically.',
        ]);

        $data = CustomReportDefinition::normalize($data);
        CustomReportDefinition::check($data, $this->service);

        return $data;
    }

    private function uniqueSlug(string $name, ?int $ignoreId = null): string
    {
        $base = Str::slug($name) ?: 'report';
        $slug = $base;
        $counter = 2;

        while (CustomReport::query()
            ->where('slug', $slug)
            ->when($ignoreId, fn ($query) => $query->where('id', '!=', $ignoreId))
            ->exists()) {
            $slug = "{$base}-{$counter}";
            $counter++;
        }

        return $slug;
    }
}
