<?php

namespace App\Services\Reports;

/**
 * Streams report rows into a PDF table using the report's layout
 * (page size, orientation, margins, header/footer, colours; header repeats on every page).
 *
 * Built on FPDF for speed; finished pages are compressed immediately (see CustomReportPdfDocument)
 * so a 100k+ row export needs tens of MB instead of hundreds.
 * Core PDF fonts are Latin-1 only: characters outside Windows-1252 print as "?".
 */
class CustomReportPdfWriter implements CustomReportFileWriter
{
    private CustomReportPdfDocument $pdf;

    /** @var array<int, array{key: string, format: string, align: string, width: float}> */
    private array $columns = [];

    private float $fontSize = 8.0;

    private float $rowHeight = 5.0;

    private float $usableWidth = 190.0;

    /** @var int[]|null alternate row fill, null when stripes are off */
    private ?array $stripe = null;

    private int $rowIndex = 0;

    /** rows | grid | none */
    private string $tableLines = 'rows';

    /** @var int[] */
    private array $borderRgb = [226, 232, 240];

    private const MAX_WRAP_LINES = 8;

    private bool $wrap = false;

    private float $lineHeight = 3.4;

    public function __construct(private readonly string $path)
    {
    }

    public function begin(
        string $title,
        ?string $subtitle,
        array $columns,
        array $sampleRows,
        int $totalRows,
        array $layout,
        array $branding,
    ): void {
        $layout = CustomReportLayout::normalize($layout);
        $margin = CustomReportLayout::marginMm($layout);
        $landscape = CustomReportLayout::isLandscape($layout, count($columns));

        // "normal" text shrinks a little for very wide tables; small/large are used as chosen.
        $this->fontSize = CustomReportLayout::fontPt($layout);
        if ($layout['font_size'] === 'normal' && count($columns) > 10) {
            $this->fontSize = 7.0;
        }
        $this->rowHeight = round($this->fontSize * 0.625, 2);

        $this->pdf = new CustomReportPdfDocument($landscape ? 'L' : 'P', 'mm', $layout['page_size']);
        $pdf = $this->pdf;
        $pdf->SetTitle($this->encode($title));
        $pdf->SetCreator('ERP Report Builder');

        $colors = $layout['colors'];
        $this->stripe = $colors['stripe_bg'] !== '' ? CustomReportLayout::rgb($colors['stripe_bg']) : null;

        $pdf->margin = $margin;
        $pdf->headerAlign = $layout['header']['align'] === 'center' ? 'C' : 'L';
        $pdf->repeatHeader = $layout['header']['repeat'];
        $pdf->companyLines = array_map([$this, 'encode'], CustomReportLayout::companyLines($layout, $branding));
        $pdf->headerTextLines = array_map([$this, 'encode'], CustomReportLayout::textLines($layout['header']['text'], $branding));
        $pdf->reportTitle = $this->encode($title);
        $pdf->reportSubtitle = $layout['header']['show_filters'] && $subtitle ? $this->encode($subtitle) : null;
        $pdf->footerTextLines = array_map([$this, 'encode'], CustomReportLayout::textLines($layout['footer']['text'], $branding));
        $pdf->generatedText = $layout['footer']['show_generated'] ? $this->encode(CustomReportLayout::generatedText($branding)) : null;
        $pdf->showPageNumbers = $layout['footer']['show_page_numbers'];
        $pdf->colors = [
            'title' => CustomReportLayout::rgb($colors['title']),
            'header_bg' => CustomReportLayout::rgb($colors['header_bg']),
            'header_text' => CustomReportLayout::rgb($colors['header_text']),
            'border' => CustomReportLayout::rgb($colors['border']),
        ];
        $pdf->tableFontSize = $this->fontSize;
        $pdf->headerRowHeight = max(6.0, $this->rowHeight + 1);

        $pdf->SetMargins($margin, $margin, $margin);
        $pdf->SetAutoPageBreak(true, $margin + $pdf->footerHeight());

        $usable = $this->usableWidth = $pdf->GetPageWidth() - 2 * $margin;
        $weights = [];
        foreach ($columns as $column) {
            $weights[] = $this->columnWeight($column, $sampleRows);
        }
        $this->wrap = (bool) $layout['wrap_text'];
        $widths = $this->distributeWidths($columns, $weights, $usable, $sampleRows);

        foreach ($columns as $index => $column) {
            $format = $column['format'] ?? 'text';
            $this->columns[] = [
                'key' => $column['key'],
                'format' => $format,
                'align' => match ($column['align'] ?? (in_array($format, ['money', 'number'], true) ? 'right' : 'left')) {
                    'right' => 'R',
                    'center' => 'C',
                    default => 'L',
                },
                'width' => $widths[$index],
            ];
        }

        $pdf->tableColumns = array_map(fn ($column, $meta) => [
            'label' => $this->encode((string) ($column['label'] ?? $column['key'])),
            'width' => $meta['width'],
            'align' => $meta['align'],
        ], $columns, $this->columns);

        $this->wrap = (bool) $layout['wrap_text'];
        $this->lineHeight = round($this->fontSize * 0.3528 * 1.2, 2);

        $this->tableLines = $pdf->tableLines = $layout['table_lines'];
        $this->borderRgb = CustomReportLayout::rgb($colors['border']);

        $pdf->AliasNbPages(); // "{nb}" in the footer becomes the total page count
        $this->newPage();
    }

    /**
     * FPDF restores the font and colours that were active before AddPage() once Header() has run,
     * so the row style has to be set again after every new page (otherwise rows inherit the bold
     * heading font and a black line colour).
     */
    private function newPage(): void
    {
        $this->pdf->AddPage();
        $this->pdf->SetFont('Helvetica', '', $this->fontSize);
        $this->pdf->SetTextColor(15, 23, 42);
        $this->pdf->SetDrawColor(...$this->borderRgb);
    }

    public function write(array $row): void
    {
        $pdf = $this->pdf;

        $cells = [];
        $lineCount = 1;
        foreach ($this->columns as $column) {
            $text = $this->format($row[$column['key']] ?? null, $column['format']);
            // Numbers and dates never wrap; text wraps only when the layout asks for it.
            $lines = $this->wrap && $column['format'] === 'text'
                ? $this->wrapLines($text, $column['width'])
                : [$this->fit($text, $column['width'])];
            $cells[] = $lines;
            $lineCount = max($lineCount, count($lines));
        }
        $height = $lineCount === 1
            ? $this->rowHeight
            : max($this->rowHeight, $lineCount * $this->lineHeight + ($this->rowHeight - $this->lineHeight));

        if ($pdf->GetY() + $height > $pdf->pageBreakTrigger()) {
            $this->newPage();
        }

        $x = $pdf->GetX();
        $y = $pdf->GetY();

        if ($this->stripe && $this->rowIndex % 2 === 1) {
            $pdf->SetFillColor(...$this->stripe);
            $pdf->Rect($x, $y, $this->usableWidth, $height, 'F');
        }
        $this->rowIndex++;

        if ($lineCount === 1) {
            foreach ($this->columns as $index => $column) {
                $pdf->Cell($column['width'], $height, $cells[$index][0], 0, 0, $column['align']);
            }
        } else {
            // Multi-line row: each cell's lines start at the top of the row.
            $top = $y + ($this->rowHeight - $this->lineHeight) / 2;
            $cellX = $x;
            foreach ($this->columns as $index => $column) {
                foreach ($cells[$index] as $lineIndex => $line) {
                    $pdf->SetXY($cellX, $top + $lineIndex * $this->lineHeight);
                    $pdf->Cell($column['width'], $this->lineHeight, $line, 0, 0, $column['align']);
                }
                $cellX += $column['width'];
            }
        }

        if ($this->tableLines !== 'none') {
            $pdf->Line($x, $y + $height, $x + $this->usableWidth, $y + $height);
        }
        if ($this->tableLines === 'grid') {
            // Vertical lines at the left edge, between columns and at the right edge.
            $lineX = $x;
            $pdf->Line($lineX, $y, $lineX, $y + $height);
            foreach ($this->columns as $column) {
                $lineX += $column['width'];
                $pdf->Line($lineX, $y, $lineX, $y + $height);
            }
        }
        $pdf->SetXY($x, $y + $height);
    }

    /**
     * Share the page width between columns by content weight, but never narrower than the
     * longest word of the column heading (so headings like "Brand" are not cut to "Bra...").
     *
     * @return float[]
     */
    private function distributeWidths(array $columns, array $weights, float $usable, array $sampleRows): array
    {
        $pdf = $this->pdf;
        $minimums = array_map(function ($column) use ($pdf, $sampleRows) {
            $pdf->SetFont('Helvetica', 'B', $this->fontSize);
            $words = preg_split('/\s+/', (string) ($column['label'] ?? $column['key'])) ?: [''];
            $widest = max(array_map(fn ($word) => $pdf->GetStringWidth($this->encode($word)), $words));

            // Wrapped text should break between words, so also fit the typical longest word of the data
            // (90th percentile of the sampled rows, so one odd value does not widen the column).
            if ($this->wrap && ($column['format'] ?? 'text') === 'text' && $sampleRows) {
                $pdf->SetFont('Helvetica', '', $this->fontSize);
                $longest = [];
                foreach ($sampleRows as $row) {
                    $valueWords = preg_split('/\s+/', (string) ($row[$column['key']] ?? '')) ?: [''];
                    $longest[] = max(array_map(fn ($word) => $pdf->GetStringWidth($this->encode($word)), $valueWords));
                }
                sort($longest);
                $widest = max($widest, $longest[(int) floor((count($longest) - 1) * 0.9)]);
            }

            return min($widest + 2.5, 35.0);
        }, $columns);

        // Too many columns for even the minimums: fall back to plain proportional widths.
        if (array_sum($minimums) >= $usable) {
            $total = array_sum($weights) ?: 1;
            return array_map(fn ($weight) => $usable * $weight / $total, $weights);
        }

        $fixed = [];
        for ($pass = 0; $pass < count($columns); $pass++) {
            $freeWeight = array_sum(array_diff_key($weights, $fixed)) ?: 1;
            $freeWidth = $usable - array_sum(array_intersect_key($minimums, $fixed));
            $changed = false;
            foreach ($weights as $index => $weight) {
                if (!isset($fixed[$index]) && $freeWidth * $weight / $freeWeight < $minimums[$index]) {
                    $fixed[$index] = true;
                    $changed = true;
                }
            }
            if (!$changed) {
                break;
            }
        }

        $freeWeight = array_sum(array_diff_key($weights, $fixed)) ?: 1;
        $freeWidth = $usable - array_sum(array_intersect_key($minimums, $fixed));

        return array_map(
            fn ($index) => isset($fixed[$index]) ? $minimums[$index] : $freeWidth * $weights[$index] / $freeWeight,
            array_keys($weights)
        );
    }

    /**
     * Split text into lines that fit the cell, breaking at spaces where possible.
     * Capped at MAX_WRAP_LINES so one huge value cannot take a whole page.
     *
     * @return string[]
     */
    private function wrapLines(string $text, float $width): array
    {
        $available = $width - 2; // FPDF cell margin (1mm each side)
        if ($text === '' || strlen($text) * $this->fontSize * 0.3528 * 0.95 <= $available
            || $this->pdf->GetStringWidth($text) <= $available) {
            return [$text];
        }

        $lines = [];
        $current = '';
        foreach (preg_split('/(\s+)/', $text, -1, PREG_SPLIT_NO_EMPTY) as $word) {
            $candidate = $current === '' ? $word : $current . ' ' . $word;
            if ($this->pdf->GetStringWidth($candidate) <= $available) {
                $current = $candidate;
                continue;
            }
            if ($current !== '') {
                $lines[] = $current;
            }
            // A single word longer than the cell is broken into pieces.
            while ($this->pdf->GetStringWidth($word) > $available && strlen($word) > 1) {
                $cut = strlen($word) - 1;
                while ($cut > 1 && $this->pdf->GetStringWidth(substr($word, 0, $cut)) > $available) {
                    $cut--;
                }
                $lines[] = substr($word, 0, $cut);
                $word = substr($word, $cut);
            }
            $current = $word;
        }
        if ($current !== '') {
            $lines[] = $current;
        }

        if (count($lines) > self::MAX_WRAP_LINES) {
            $lines = array_slice($lines, 0, self::MAX_WRAP_LINES);
            $lines[self::MAX_WRAP_LINES - 1] = $this->fit($lines[self::MAX_WRAP_LINES - 1] . ' ...', $width);
        }

        return $lines;
    }

    public function finish(?string $note = null, array $totals = []): void
    {
        if ($totals) {
            $this->writeTotals($totals);
        }
        if ($note) {
            $this->pdf->Ln(2);
            $this->pdf->SetFont('Helvetica', 'I', 8);
            $this->pdf->SetTextColor(180, 83, 9);
            $this->pdf->MultiCell(0, 4, $this->encode($note));
        }

        $this->pdf->Output('F', $this->path);
    }

    /** Bold "Total" row under the table, with a line above it; the label goes in the first non-total column. */
    private function writeTotals(array $totals): void
    {
        $pdf = $this->pdf;
        $height = $this->rowHeight + 1;
        if ($pdf->GetY() + $height > $pdf->pageBreakTrigger()) {
            $this->newPage();
        }

        $x = $pdf->GetX();
        $y = $pdf->GetY();
        $labelIndex = null;
        foreach ($this->columns as $index => $column) {
            if (!array_key_exists($column['key'], $totals)) {
                $labelIndex = $index;
                break;
            }
        }

        $pdf->SetFont('Helvetica', 'B', $this->fontSize);
        foreach ($this->columns as $index => $column) {
            $text = match (true) {
                array_key_exists($column['key'], $totals) => $this->fit($this->format($totals[$column['key']], $column['format']), $column['width']),
                $index === $labelIndex => 'Total',
                default => '',
            };
            $pdf->Cell($column['width'], $height, $text, 0, 0, $index === $labelIndex ? 'L' : $column['align']);
        }

        $pdf->SetDrawColor(71, 85, 105);
        $pdf->Line($x, $y, $x + $this->usableWidth, $y);
        $pdf->Line($x, $y + $height, $x + $this->usableWidth, $y + $height);
        if ($this->tableLines === 'grid') {
            $pdf->SetDrawColor(...$this->borderRgb);
            $lineX = $x;
            $pdf->Line($lineX, $y, $lineX, $y + $height);
            foreach ($this->columns as $column) {
                $lineX += $column['width'];
                $pdf->Line($lineX, $y, $lineX, $y + $height);
            }
        }
        $pdf->SetDrawColor(...$this->borderRgb);
        $pdf->SetFont('Helvetica', '', $this->fontSize);
        $pdf->SetXY($x, $y + $height);
    }

    private function format(mixed $value, string $format): string
    {
        if ($value === null || $value === '') {
            return '';
        }

        if (($format === 'money' || $format === 'number') && is_numeric($value)) {
            $number = $value + 0;
            if ($format === 'money') {
                return number_format($number, 2);
            }
            return floor($number) == $number ? number_format($number) : rtrim(rtrim(number_format($number, 4), '0'), '.');
        }

        if ($format === 'date') {
            return substr((string) $value, 0, 10);
        }

        return $this->encode(str_replace(["\r", "\n", "\t"], ' ', (string) $value));
    }

    /** Truncate text with "..." so it fits in the cell (cells never wrap, keeping rows fixed-height). */
    private function fit(string $text, float $width): string
    {
        $available = $width - 2; // FPDF cell margin (1mm each side)
        // Fast path: even the widest glyphs (~0.95em) fit.
        if (strlen($text) * $this->fontSize * 0.3528 * 0.95 <= $available) {
            return $text;
        }
        if ($this->pdf->GetStringWidth($text) <= $available) {
            return $text;
        }

        $ellipsis = '...';
        $limit = $available - $this->pdf->GetStringWidth($ellipsis);
        $low = 0;
        $high = strlen($text);
        while ($low < $high) {
            $mid = intdiv($low + $high + 1, 2);
            if ($this->pdf->GetStringWidth(substr($text, 0, $mid)) <= $limit) {
                $low = $mid;
            } else {
                $high = $mid - 1;
            }
        }

        return rtrim(substr($text, 0, $low)) . $ellipsis;
    }

    private function columnWeight(array $column, array $sampleRows): float
    {
        $format = $column['format'] ?? 'text';
        $labelLength = mb_strlen((string) ($column['label'] ?? $column['key']));
        $lengths = [];
        foreach ($sampleRows as $row) {
            $lengths[] = mb_strlen($this->format($row[$column['key']] ?? null, $format));
        }
        sort($lengths);

        if ($format === 'money' || $format === 'number') {
            // Only the first rows are sampled, so leave room for larger numbers further down.
            $widest = $lengths ? end($lengths) : 0;
            return (float) min(max($widest + 3, $labelLength, $format === 'money' ? 12 : 8), 20);
        }
        if ($format === 'date') {
            return (float) max(10, $labelLength);
        }

        // 90th percentile so one long value does not squeeze every other column.
        $typical = $lengths ? $lengths[(int) floor((count($lengths) - 1) * 0.9)] : 0;

        return (float) min(max($typical, $labelLength, 5), 45);
    }

    private function encode(string $text): string
    {
        return preg_match('/[^\x20-\x7E]/', $text)
            ? mb_convert_encoding($text, 'Windows-1252', 'UTF-8')
            : $text;
    }
}
