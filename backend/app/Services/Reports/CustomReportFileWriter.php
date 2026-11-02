<?php

namespace App\Services\Reports;

interface CustomReportFileWriter
{
    /**
     * @param  array<int, array{key: string, label?: string, align?: string, format?: string}>  $columns
     * @param  array<int, array<string, mixed>>  $sampleRows  first rows, used to size columns
     * @param  int  $totalRows  rows that will be written (known up front from a COUNT query)
     * @param  array  $layout  normalized CustomReportLayout
     * @param  array  $branding  CustomReportLayout::branding()
     */
    public function begin(
        string $title,
        ?string $subtitle,
        array $columns,
        array $sampleRows,
        int $totalRows,
        array $layout,
        array $branding,
    ): void;

    /** @param array<string, mixed> $row */
    public function write(array $row): void;

    /** @param array<string, mixed> $totals  column key => sum, written as a "Total" row (empty = no row) */
    public function finish(?string $note = null, array $totals = []): void;
}
