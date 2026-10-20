<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Contracts\Filesystem\FileNotFoundException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\BinaryFileResponse;
use Throwable;
use ZipArchive;

class SystemBackupService
{
    private const BACKUP_DIRECTORY = 'backups';

    private const TABLE_GROUPS = [
        'master-data' => [
            'companies',
            'branch_dels',
            'roles',
            'role_permissions',
            'users',
            'departments',
            'stores',
            'categories',
            'm_brands',
            'm__makes',
            'm_colors',
            'items',
            'customers',
            'suppliers',
            'm_schemas',
            'm_guarantors',
            'bank_details',
            'bank_branches',
            'm_areas',
            'm_routes',
            'm_salesmen',
            'sales_return_reasons',
            'm_main_categories',
            'm_main_account_types',
            'm_chartof_accounts',
        ],
        'inventory' => [
            'item_batches',
            't_item_movements',
            't_item_serial_movements',
        ],
        'purchases' => [
            't_purchase_order_sums',
            't_purchases_order_details',
            't_purchases_sums',
            't_purchases_details',
            't_supplier_payments',
            't_supplier_invoice_payments',
            't_sup_cheques',
            't_sup_purchase_trances',
        ],
        'sales' => [
            't_invoice_sums',
            't_invoice_deils',
            't_advanc_cus_payments',
            't_sales_return_sums',
            't_sales_return_details',
            't_customer_payments',
            't_cus_cheques',
            't_customer_invoice_payments',
            't_customer_advance_allocations',
            't_customer_account_trances',
        ],
        'hire-purchase' => [
            't_hire_purchase_sums',
            't_hire_purchase_details',
            't_instalments',
            't_hire_purchase_to_sales',
            't_hire_purchase_return_sums',
            't_hire_purchase_return_details',
            't_hp_installment_payments',
            'hp_status_histories',
            't_customer_hp_advance_allocations',
        ],
        'service' => [
            't_service_returns',
            't_service_dispatches',
            't_service_issues',
            't_service_invoices',
            't_service_customer_payments',
            't_service_supplier_payments',
            't_service_item_tracks',
        ],
        'finance' => [
            't_account_trans',
            'day_end_balances',
            't_payment_vouchers',
            't_petty_cashes',
            't_expenses',
            't_cashouts',
            't_bank_entries',
            'cheque_status_histories',
        ],
        'system' => [
            'personal_access_tokens',
            'migrations',
        ],
    ];

    private const REFRESH_TABLES = [
        't_customer_hp_advance_allocations',
        't_customer_advance_allocations',
        't_customer_invoice_payments',
        't_supplier_invoice_payments',
        't_hp_installment_payments',
        'hp_status_histories',
        'cheque_status_histories',
        't_sales_return_details',
        't_sales_return_sums',
        't_hire_purchase_return_details',
        't_hire_purchase_return_sums',
        't_hire_purchase_to_sales',
        't_instalments',
        't_hire_purchase_details',
        't_hire_purchase_sums',
        't_invoice_deils',
        't_invoice_sums',
        't_customer_payments',
        't_advanc_cus_payments',
        't_purchases_details',
        't_purchases_sums',
        't_supplier_payments',
        't_purchases_order_details',
        't_purchase_order_sums',
        't_item_serial_movements',
        't_item_movements',
        'item_batches',
        't_customer_account_trances',
        't_sup_purchase_trances',
        't_sup_cheques',
        't_cus_cheques',
        't_service_item_tracks',
        't_service_supplier_payments',
        't_service_customer_payments',
        't_service_invoices',
        't_service_issues',
        't_service_dispatches',
        't_service_returns',
        't_payment_vouchers',
        't_petty_cashes',
        't_expenses',
        't_cashouts',
        't_bank_entries',
        'day_end_balances',
        't_account_trans',
    ];

    public function listBackups(): array
    {
        $disk = Storage::disk('local');

        if (! $disk->exists(self::BACKUP_DIRECTORY)) {
            return [];
        }

        return collect($disk->files(self::BACKUP_DIRECTORY))
            ->filter(fn (string $path) => str_ends_with($path, '.json'))
            ->map(function (string $path) use ($disk) {
                $raw = $disk->get($path);
                $decoded = json_decode($raw, true);

                return is_array($decoded) ? $decoded : null;
            })
            ->filter()
            ->sortByDesc('created_at')
            ->values()
            ->all();
    }

    public function createBackup(User $user, string $mode): array
    {
        $disk = Storage::disk('local');
        $disk->makeDirectory(self::BACKUP_DIRECTORY);

        $timestamp = now();
        $identifier = sprintf(
            'erp-backup-%s-%s',
            $timestamp->format('Ymd-His'),
            Str::slug($mode)
        );
        $zipRelativePath = self::BACKUP_DIRECTORY.'/'.$identifier.'.zip';
        $metaRelativePath = self::BACKUP_DIRECTORY.'/'.$identifier.'.json';
        $zipAbsolutePath = $disk->path($zipRelativePath);

        $manifest = [
            'id' => $identifier,
            'mode' => $mode,
            'created_at' => $timestamp->toIso8601String(),
            'created_by' => [
                'id' => $user->id,
                'username' => $user->username,
                'email' => $user->email,
                'branch' => $user->BC,
            ],
            'scope' => 'full-erp-dataset',
            'groups' => [],
        ];

        $temporaryFiles = [];
        $rowTotal = 0;
        $tableTotal = 0;
        $zip = new ZipArchive();

        if ($zip->open($zipAbsolutePath, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) {
            throw new \RuntimeException('Unable to initialize the backup archive.');
        }

        try {
            foreach (self::TABLE_GROUPS as $group => $tables) {
                $groupEntries = [];

                foreach ($tables as $table) {
                    if (! Schema::hasTable($table)) {
                        continue;
                    }

                    $columns = Schema::getColumnListing($table);
                    $rowCount = DB::table($table)->count();
                    $rowTotal += $rowCount;
                    $tableTotal++;

                    $csvRelativePath = $group.'/'.$table.'.csv';
                    $temporaryPath = tempnam(sys_get_temp_dir(), 'erp-backup-');

                    if ($temporaryPath === false) {
                        throw new \RuntimeException('Unable to create a temporary backup file.');
                    }

                    $temporaryFiles[] = $temporaryPath;
                    $this->writeTableCsv($table, $columns, $temporaryPath);

                    $zip->addFile($temporaryPath, $csvRelativePath);

                    $groupEntries[] = [
                        'table' => $table,
                        'rows' => $rowCount,
                        'file' => $csvRelativePath,
                    ];
                }

                if ($groupEntries !== []) {
                    $manifest['groups'][$group] = $groupEntries;
                }
            }

            $zip->addFromString(
                'manifest.json',
                json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
            );
        } finally {
            $zip->close();

            foreach ($temporaryFiles as $temporaryFile) {
                if (is_file($temporaryFile)) {
                    @unlink($temporaryFile);
                }
            }
        }

        $metadata = [
            'id' => $identifier,
            'filename' => basename($zipRelativePath),
            'mode' => $mode,
            'status' => $mode === 'refresh' ? 'backup_created' : 'completed',
            'created_at' => $timestamp->toIso8601String(),
            'created_by' => [
                'id' => $user->id,
                'username' => $user->username,
                'email' => $user->email,
                'branch' => $user->BC,
            ],
            'download_url' => '/v1/system/backups/'.basename($zipRelativePath).'/download',
            'size_bytes' => $disk->size($zipRelativePath),
            'size_label' => $this->formatBytes($disk->size($zipRelativePath)),
            'totals' => [
                'tables' => $tableTotal,
                'rows' => $rowTotal,
            ],
            'refresh_summary' => null,
            'preserves' => [
                'users',
                'roles',
                'master registries',
                'categories',
                'items',
                'customers',
                'suppliers',
                'chart of accounts',
            ],
        ];

        $this->storeMetadata($metaRelativePath, $metadata);

        if ($mode === 'refresh') {
            try {
                $metadata['refresh_summary'] = $this->refreshOperationalData();
                $metadata['status'] = 'completed';
                $this->storeMetadata($metaRelativePath, $metadata);
            } catch (Throwable $exception) {
                $metadata['status'] = 'backup_created_refresh_failed';
                $metadata['refresh_error'] = $exception->getMessage();
                $this->storeMetadata($metaRelativePath, $metadata);

                throw new \RuntimeException(
                    'Backup ZIP was created successfully, but the refresh step failed. Download the backup before retrying.',
                    previous: $exception
                );
            }
        }

        return $metadata;
    }

    public function download(string $filename): BinaryFileResponse
    {
        $safeName = basename($filename);
        $relativePath = self::BACKUP_DIRECTORY.'/'.$safeName;
        $disk = Storage::disk('local');

        if (! $disk->exists($relativePath)) {
            throw new FileNotFoundException("Backup [{$safeName}] was not found.");
        }

        return response()->download(
            $disk->path($relativePath),
            $safeName,
            ['Content-Type' => 'application/zip']
        );
    }

    private function refreshOperationalData(): array
    {
        return DB::transaction(function () {
            $details = [];
            $rowsCleared = 0;

            Schema::disableForeignKeyConstraints();

            try {
                foreach (self::REFRESH_TABLES as $table) {
                    if (! Schema::hasTable($table)) {
                        continue;
                    }

                    $count = DB::table($table)->count();
                    DB::table($table)->delete();

                    $details[] = [
                        'table' => $table,
                        'rows' => $count,
                    ];
                    $rowsCleared += $count;
                }
            } finally {
                Schema::enableForeignKeyConstraints();
            }

            if (Schema::hasTable('customers')) {
                DB::table('customers')->update([
                    'advance_balance' => 0,
                ]);
            }

            return [
                'tables_cleared' => count($details),
                'rows_cleared' => $rowsCleared,
                'details' => collect($details)
                    ->filter(fn (array $detail) => $detail['rows'] > 0)
                    ->values()
                    ->all(),
            ];
        });
    }

    private function writeTableCsv(string $table, array $columns, string $targetPath): void
    {
        $handle = fopen($targetPath, 'wb');

        if ($handle === false) {
            throw new \RuntimeException("Unable to write the CSV file for table [{$table}].");
        }

        try {
            fputcsv($handle, $columns);

            $orderColumn = $columns[0] ?? null;
            $query = DB::table($table);

            if ($orderColumn !== null) {
                $query->orderBy($orderColumn);
            }

            foreach ($query->cursor() as $row) {
                $payload = [];

                foreach ($columns as $column) {
                    $payload[] = $this->normalizeCsvValue($row->{$column} ?? null);
                }

                fputcsv($handle, $payload);
            }
        } finally {
            fclose($handle);
        }
    }

    private function normalizeCsvValue(mixed $value): string | int | float
    {
        if ($value === null) {
            return '';
        }

        if (is_bool($value)) {
            return $value ? 1 : 0;
        }

        if (is_int($value) || is_float($value)) {
            return $value;
        }

        if (is_array($value) || is_object($value)) {
            return json_encode($value, JSON_UNESCAPED_SLASHES) ?: '';
        }

        return (string) $value;
    }

    private function formatBytes(int $bytes): string
    {
        if ($bytes < 1024) {
            return $bytes.' B';
        }

        $units = ['KB', 'MB', 'GB', 'TB'];
        $size = $bytes / 1024;
        $unitIndex = 0;

        while ($size >= 1024 && $unitIndex < count($units) - 1) {
            $size /= 1024;
            $unitIndex++;
        }

        return number_format($size, 2).' '.$units[$unitIndex];
    }

    private function storeMetadata(string $path, array $metadata): void
    {
        Storage::disk('local')->put(
            $path,
            json_encode($metadata, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES)
        );
    }
}
