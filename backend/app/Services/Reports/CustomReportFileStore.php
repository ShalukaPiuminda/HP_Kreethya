<?php

namespace App\Services\Reports;

use App\Models\CustomReport;
use App\Services\CustomReportService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\ValidationException;
use RuntimeException;
use Throwable;

/**
 * Report Builder reports as project files: backend/resources/reports/<slug>.json.
 *
 * Files travel with the code (git or upload). The custom_reports table is the runtime copy:
 * sync() creates/updates rows from the files and removes rows whose file was deleted.
 * Which rows came from files is remembered in storage/app/reports-sync.json, so reports
 * created directly on a server (no file) are never touched.
 */
class CustomReportFileStore
{
    private const FILE_FORMAT = 'erp-custom-report';
    private const FILE_VERSION = 1;
    private const FINGERPRINT_KEY = 'custom-reports:files-fingerprint';
    private const LOCK_KEY = 'custom-reports:files-sync';

    public function __construct(private readonly CustomReportService $service)
    {
    }

    public function directory(): string
    {
        return rtrim((string) config('reports.path', resource_path('reports')), '\\/');
    }

    /** Whether editing a report also writes its file (local PC) or file reports are view-only (server). */
    public function canWrite(): bool
    {
        return (bool) config('reports.write_files', false);
    }

    public function filePath(string $slug): string
    {
        return $this->directory() . DIRECTORY_SEPARATOR . $slug . '.json';
    }

    /** Path shown to users, relative to the backend folder. */
    public function displayPath(string $slug): string
    {
        return str_replace('\\', '/', ltrim(str_replace(base_path(), '', $this->filePath($slug)), '\\/'));
    }

    public function isFileReport(string $slug): bool
    {
        return is_file($this->filePath($slug));
    }

    /** Write (or rewrite) a report's file. Removes the old file when the report was renamed. */
    public function write(CustomReport $report, ?string $previousSlug = null): string
    {
        $directory = $this->directory();
        if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) {
            throw new RuntimeException("Cannot create the report folder {$directory}.");
        }

        $definition = CustomReportDefinition::normalize($report->toArray());
        $json = json_encode(
            ['format' => self::FILE_FORMAT, 'version' => self::FILE_VERSION, 'slug' => $report->slug, ...$definition],
            JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
        ) . "\n";

        // Write to a temporary file first so a half-written file is never picked up by a sync.
        $path = $this->filePath($report->slug);
        $temporary = $path . '.tmp';
        if (file_put_contents($temporary, $json) === false || !rename($temporary, $path)) {
            @unlink($temporary);
            throw new RuntimeException("Cannot write the report file {$path}.");
        }

        if ($previousSlug && $previousSlug !== $report->slug) {
            $this->delete($previousSlug);
        }

        $this->remember([$report->slug], $previousSlug ? [$previousSlug] : []);

        return $this->displayPath($report->slug);
    }

    public function delete(string $slug): void
    {
        if (is_file($this->filePath($slug))) {
            @unlink($this->filePath($slug));
        }
        $this->remember([], [$slug]);
    }

    /**
     * Load every report file into the database.
     *
     * @return array{created: int, updated: int, removed: int, exported: int, skipped: array<string, string>}
     */
    public function sync(): array
    {
        $result = ['created' => 0, 'updated' => 0, 'removed' => 0, 'exported' => 0, 'skipped' => []];
        $fileSlugs = [];

        foreach ($this->files() as $path) {
            $slug = basename($path, '.json');
            // Present in the project, even if invalid: never delete its row because of a typo in the file.
            $fileSlugs[] = $slug;

            try {
                $raw = json_decode((string) file_get_contents($path), true, 64, JSON_THROW_ON_ERROR);
                if (!is_array($raw)) {
                    throw new RuntimeException('The file does not contain a report definition.');
                }
                $definition = CustomReportDefinition::normalize($raw);
                CustomReportDefinition::check($definition, $this->service);
            } catch (ValidationException $e) {
                $result['skipped'][$slug] = collect($e->errors())->flatten()->first() ?? $e->getMessage();
                continue;
            } catch (Throwable $e) {
                $result['skipped'][$slug] = $e->getMessage();
                continue;
            }

            $report = CustomReport::query()->where('slug', $slug)->first();
            if (!$report) {
                CustomReport::create([
                    ...$definition,
                    'slug' => $slug,
                    'BC' => 'FILE',
                    'UID' => 'report-file',
                ]);
                $result['created']++;
                continue;
            }

            if ($this->comparable(CustomReportDefinition::normalize($report->toArray())) !== $this->comparable($definition)) {
                $report->update([...$definition, 'UID' => 'report-file']);
                $result['updated']++;
            }
        }

        // Rows that came from files whose file has since been removed.
        $removedSlugs = array_diff($this->rememberedSlugs(), $fileSlugs);
        if ($removedSlugs) {
            $result['removed'] = CustomReport::query()->whereIn('slug', $removedSlugs)->delete();
        }

        // Reports that exist only in the database (e.g. created before files were switched on):
        // write their files too, so every report travels with the project.
        if ($this->canWrite()) {
            $databaseOnly = CustomReport::query()->whereNotIn('slug', $fileSlugs)->get();
            foreach ($databaseOnly as $report) {
                $this->write($report);
                $fileSlugs[] = $report->slug;
                $result['exported']++;
            }
        }

        $this->saveRecord($fileSlugs);

        foreach ($result['skipped'] as $slug => $reason) {
            Log::warning("Custom report file {$slug}.json was not loaded: {$reason}");
        }

        return $result;
    }

    /**
     * Sync only when the report files changed since the last sync (names, sizes, modified times).
     * Called on normal page loads, so new files on the server are picked up without a command.
     */
    public function syncIfChanged(): void
    {
        if (!config('reports.auto_sync', true)) {
            return;
        }

        try {
            $fingerprint = $this->fingerprint();
            if (Cache::get(self::FINGERPRINT_KEY) === $fingerprint) {
                return;
            }

            Cache::lock(self::LOCK_KEY, 60)->get(function () use ($fingerprint) {
                if (Cache::get(self::FINGERPRINT_KEY) === $fingerprint) {
                    return; // another request synced while we waited
                }
                $this->sync();
                Cache::forever(self::FINGERPRINT_KEY, $this->fingerprint());
            });
        } catch (Throwable $e) {
            // Reports must keep working from the database even if a sync fails.
            report($e);
        }
    }

    /** @return string[] */
    private function files(): array
    {
        $files = glob($this->directory() . DIRECTORY_SEPARATOR . '*.json') ?: [];
        sort($files);

        return $files;
    }

    private function fingerprint(): string
    {
        clearstatcache();
        $parts = array_map(fn ($path) => basename($path) . ':' . filesize($path) . ':' . filemtime($path), $this->files());

        // The report count catches database-only reports that still need their file written,
        // and a fresh database (new installation) that needs filling from the files.
        return md5(implode('|', $parts) . '|' . count($this->rememberedSlugs()) . '|' . CustomReport::query()->count()
            . '|' . ($this->canWrite() ? 'w' : 'r'));
    }

    /** Stable representation of the fields that come from the file, for "did it change?". */
    private function comparable(array $definition): string
    {
        return json_encode(array_intersect_key($definition, array_flip(CustomReportDefinition::FIELDS)));
    }

    private function recordPath(): string
    {
        return storage_path('app' . DIRECTORY_SEPARATOR . 'reports-sync.json');
    }

    /** @return string[] slugs that were loaded from (or written to) files */
    private function rememberedSlugs(): array
    {
        $path = $this->recordPath();
        if (!is_file($path)) {
            return [];
        }
        $record = json_decode((string) file_get_contents($path), true);

        return is_array($record['slugs'] ?? null) ? array_values(array_filter($record['slugs'], 'is_string')) : [];
    }

    private function remember(array $add, array $remove): void
    {
        $slugs = array_values(array_unique(array_diff([...$this->rememberedSlugs(), ...$add], $remove)));
        $this->saveRecord($slugs);
    }

    private function saveRecord(array $slugs): void
    {
        sort($slugs);
        $path = $this->recordPath();
        if (!is_dir(dirname($path))) {
            @mkdir(dirname($path), 0775, true);
        }
        file_put_contents($path, json_encode(['slugs' => array_values(array_unique($slugs))], JSON_PRETTY_PRINT) . "\n");
    }
}
