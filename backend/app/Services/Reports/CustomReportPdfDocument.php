<?php

namespace App\Services\Reports;

use FPDF;

/**
 * FPDF document with the report's header/footer layout and low-memory page storage.
 *
 * FPDF normally keeps every page's raw content in memory until Output(). Here each page is
 * gzip-compressed as soon as it is finished (~10x smaller for tabular text) and only
 * decompressed again, one page at a time, while the file is written.
 * All strings passed in must already be Windows-1252 encoded (see CustomReportPdfWriter::encode).
 */
class CustomReportPdfDocument extends FPDF
{
    private const COMPRESSED_MARK = "\0FPDFGZ\0";

    public float $margin = 10.0;

    /** 'L' or 'C' */
    public string $headerAlign = 'L';

    /** @var string[] company name first, then address/contact lines */
    public array $companyLines = [];

    /** @var string[] */
    public array $headerTextLines = [];

    public string $reportTitle = '';

    public ?string $reportSubtitle = null;

    /** @var string[] */
    public array $footerTextLines = [];

    public ?string $generatedText = null;

    public bool $showPageNumbers = true;

    /** @var array<int, array{label: string, width: float, align: string}> */
    public array $tableColumns = [];

    public float $tableFontSize = 8.0;

    public float $headerRowHeight = 6.0;

    /** rows | grid | none */
    public string $tableLines = 'rows';

    /** Repeat the company block / title on every page (otherwise page 1 only). */
    public bool $repeatHeader = false;

    /** @var array{title: int[], header_bg: int[], header_text: int[], border: int[]} */
    public array $colors = [
        'title' => [15, 23, 42],
        'header_bg' => [241, 245, 249],
        'header_text' => [51, 65, 85],
        'border' => [226, 232, 240],
    ];

    public function pageBreakTrigger(): float
    {
        return $this->PageBreakTrigger;
    }

    /** Space the footer needs at the bottom of each page (mm, excluding the margin). */
    public function footerHeight(): float
    {
        // The first footer text line shares the bar with "Generated…" / "Page X of Y".
        $hasBar = $this->generatedText !== null || $this->showPageNumbers;
        $rows = max(count($this->footerTextLines), $hasBar ? 1 : 0);

        return $rows === 0 ? 0.0 : $rows * 3.8 + 2;
    }

    public function Header(): void
    {
        // Company block, header text, title and filters: first page only unless "repeat" is on.
        // Every page still starts with the table's column headings.
        if ($this->PageNo() === 1 || $this->repeatHeader) {
            $this->letterhead();
        }

        $this->tableHeading();
    }

    private function letterhead(): void
    {
        $width = $this->GetPageWidth() - 2 * $this->margin;
        $align = $this->headerAlign;

        foreach ($this->companyLines as $index => $line) {
            if ($index === 0) {
                $this->SetFont('Helvetica', 'B', 11);
                $this->SetTextColor(...$this->colors['title']);
                $this->Cell($width, 5.5, $this->fitText($line, $width), 0, 1, $align);
            } else {
                $this->SetFont('Helvetica', '', 8);
                $this->SetTextColor(71, 85, 105);
                $this->Cell($width, 3.8, $this->fitText($line, $width), 0, 1, $align);
            }
        }

        if ($this->headerTextLines) {
            $this->SetFont('Helvetica', '', 8.5);
            $this->SetTextColor(51, 65, 85);
            foreach ($this->headerTextLines as $line) {
                $this->Cell($width, 4, $this->fitText($line, $width), 0, 1, $align);
            }
        }

        if ($this->companyLines || $this->headerTextLines) {
            $this->Ln(1.5);
            $this->SetDrawColor(...$this->colors['border']);
            $this->Line($this->margin, $this->GetY(), $this->margin + $width, $this->GetY());
            $this->Ln(2);
        }

        $this->SetFont('Helvetica', 'B', 12);
        $this->SetTextColor(...$this->colors['title']);
        $this->Cell($width, 6, $this->fitText($this->reportTitle, $width), 0, 1, $align);

        if ($this->reportSubtitle) {
            $this->SetFont('Helvetica', '', 8);
            $this->SetTextColor(100, 116, 139);
            $this->Cell($width, 4, $this->fitText($this->reportSubtitle, $width), 0, 1, $align);
        }
        $this->Ln(2);
    }

    private function tableHeading(): void
    {
        // Column headings wrap onto up to 2 lines so narrow columns keep readable titles.
        $this->SetFont('Helvetica', 'B', $this->tableFontSize);
        $this->SetFillColor(...$this->colors['header_bg']);
        $this->SetTextColor(...$this->colors['header_text']);
        $this->SetDrawColor(...$this->colors['border']);
        $lineHeight = $this->tableFontSize * 0.3528 * 1.2;
        $labels = array_map(fn ($column) => $this->labelLines($column['label'], $column['width'] - 2), $this->tableColumns);
        $lines = max(1, ...array_map('count', $labels ?: [[1]]));
        $height = max($this->headerRowHeight, $lines * $lineHeight + 2);
        $x = $this->GetX();
        $y = $this->GetY();
        $this->Rect($x, $y, array_sum(array_column($this->tableColumns, 'width')), $height, 'F');
        foreach ($this->tableColumns as $index => $column) {
            $top = $y + ($height - count($labels[$index]) * $lineHeight) / 2;
            foreach ($labels[$index] as $lineIndex => $line) {
                $this->SetXY($x, $top + $lineIndex * $lineHeight);
                $this->Cell($column['width'], $lineHeight, $line, 0, 0, $column['align']);
            }
            $x += $column['width'];
        }
        if ($this->tableLines !== 'none') {
            $this->Line($this->margin, $y + $height, $x, $y + $height);
        }
        if ($this->tableLines === 'grid') {
            $this->Line($this->margin, $y, $x, $y);
            $lineX = $this->margin;
            $this->Line($lineX, $y, $lineX, $y + $height);
            foreach ($this->tableColumns as $column) {
                $lineX += $column['width'];
                $this->Line($lineX, $y, $lineX, $y + $height);
            }
        }
        $this->SetXY($this->margin, $y + $height);

        $this->SetFont('Helvetica', '', $this->tableFontSize);
        $this->SetTextColor(15, 23, 42);
        $this->SetDrawColor(...$this->colors['border']);
    }

    public function Footer(): void
    {
        if ($this->footerHeight() === 0.0) {
            return;
        }

        $width = $this->GetPageWidth() - 2 * $this->margin;
        $this->SetY(-($this->margin + $this->footerHeight() - 1));
        $this->SetDrawColor(...$this->colors['border']);
        $this->Line($this->margin, $this->GetY(), $this->margin + $width, $this->GetY());
        $this->Ln(1);

        $this->SetFont('Helvetica', '', 7);
        $this->SetTextColor(100, 116, 139);

        // Extra footer text lines go above the bar; the first line shares the bar (left side).
        $lines = $this->footerTextLines;
        $first = array_shift($lines);
        foreach ($lines as $line) {
            $this->SetX($this->margin);
            $this->Cell($width, 3.8, $this->fitText($line, $width), 0, 1, 'L');
        }

        $y = $this->GetY();
        $third = $width / 3;
        if ($first !== null) {
            $this->SetXY($this->margin, $y);
            $this->Cell($this->generatedText !== null ? $third * 1.4 : $width * 0.75, 3.8, $this->fitText($first, $this->generatedText !== null ? $third * 1.4 : $width * 0.75), 0, 0, 'L');
        }
        if ($this->generatedText !== null) {
            $this->SetXY($this->margin, $y);
            $this->Cell($width, 3.8, $this->generatedText, 0, 0, $first !== null ? 'C' : 'L');
        }
        if ($this->showPageNumbers) {
            $this->SetXY($this->margin, $y);
            // {nb} is replaced with the real page count when the file is written (AliasNbPages).
            $this->Cell($width, 3.8, 'Page ' . $this->PageNo() . ' of {nb}', 0, 0, 'R');
        }
    }

    protected function _endpage()
    {
        parent::_endpage();

        if ($this->compress && isset($this->pages[$this->page])) {
            $this->pages[$this->page] = self::COMPRESSED_MARK . gzcompress($this->pages[$this->page]);
        }
    }

    /**
     * Pages are written one at a time: restore this page's raw content (so FPDF can fill in
     * the {nb} page total and compress it normally), write it, then free it.
     */
    protected function _putpage($n)
    {
        if (str_starts_with($this->pages[$n], self::COMPRESSED_MARK)) {
            $this->pages[$n] = gzuncompress(substr($this->pages[$n], strlen(self::COMPRESSED_MARK)));
        }

        parent::_putpage($n);
        $this->pages[$n] = '';
    }

    /** Split a column heading into at most 2 lines that fit the column. */
    private function labelLines(string $label, float $width): array
    {
        if ($this->GetStringWidth($label) <= $width) {
            return [$label];
        }

        $words = preg_split('/\s+/', trim($label)) ?: [$label];
        $first = '';
        while ($words && $this->GetStringWidth(trim($first . ' ' . $words[0])) <= $width) {
            $first = trim($first . ' ' . array_shift($words));
        }
        if ($first === '') {
            return [$this->fitText($label, $width)]; // one word longer than the column
        }

        return array_values(array_filter([$first, $words ? $this->fitText(implode(' ', $words), $width) : '']));
    }

    private function fitText(string $text, float $width): string
    {
        if ($this->GetStringWidth($text) <= $width) {
            return $text;
        }
        while ($text !== '' && $this->GetStringWidth($text . '...') > $width) {
            $text = substr($text, 0, -1);
        }

        return $text . '...';
    }
}
