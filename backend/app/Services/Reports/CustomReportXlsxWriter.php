<?php

namespace App\Services\Reports;

use DateTimeImmutable;
use OpenSpout\Common\Entity\Cell;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Common\Entity\Style\Border;
use OpenSpout\Common\Entity\Style\BorderPart;
use OpenSpout\Common\Entity\Style\CellAlignment;
use OpenSpout\Common\Entity\Style\Style;
use OpenSpout\Writer\XLSX\Entity\SheetView;
use OpenSpout\Writer\XLSX\Options;
use OpenSpout\Writer\XLSX\Options\HeaderFooter;
use OpenSpout\Writer\XLSX\Options\PageOrientation;
use OpenSpout\Writer\XLSX\Options\PageSetup;
use OpenSpout\Writer\XLSX\Options\PaperSize;
use OpenSpout\Writer\XLSX\Writer;

/**
 * Streams report rows into an .xlsx file. openspout writes each row straight to disk,
 * so memory stays flat no matter how many rows are exported.
 */
class CustomReportXlsxWriter implements CustomReportFileWriter
{
    private Writer $writer;

    /** @var array<int, array{key: string, format: string, style: ?Style}> */
    private array $columns = [];

    /** @var array<string, DateTimeImmutable|string> */
    private array $dateCache = [];

    private const MAX_STYLED_ROWS = 50000;

    /** Row styles for stripes / grid borders; null = plain row. */
    private ?Style $evenRowStyle = null;

    private ?Style $oddRowStyle = null;

    private int $rowIndex = 0;

    /** @var string[] */
    private array $footerLines = [];

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
        $colors = $layout['colors'];

        // Print settings: paper size, orientation, fit all columns to the page width, footer.
        $options = new Options();
        $options->setPageSetup(new PageSetup(
            CustomReportLayout::isLandscape($layout, count($columns)) ? PageOrientation::LANDSCAPE : PageOrientation::PORTRAIT,
            constant(PaperSize::class . '::' . $layout['page_size']),
            fitToHeight: 0,
            fitToWidth: 1,
        ));
        $printFooter = $this->printFooter($layout, $branding);
        if ($printFooter !== '') {
            $options->setHeaderFooter(new HeaderFooter(oddFooter: $printFooter));
        }

        $this->writer = new Writer($options);
        $this->writer->openToFile($this->path);

        $sheet = $this->writer->getCurrentSheet();
        $sheet->setName(mb_substr(preg_replace('/[\\\\\/?*\[\]:]/', ' ', $title) ?: 'Report', 0, 31));

        // Top block: company, custom header text, title, filters + generated.
        $topRows = [];
        foreach (CustomReportLayout::companyLines($layout, $branding) as $index => $line) {
            $topRows[] = Row::fromValues([$line], $index === 0
                ? (new Style())->setFontBold()->setFontSize(12)->setFontColor(CustomReportLayout::argb($colors['title']))
                : (new Style())->setFontSize(9)->setFontColor('475569'));
        }
        foreach (CustomReportLayout::textLines($layout['header']['text'], $branding) as $line) {
            $topRows[] = Row::fromValues([$line], (new Style())->setFontSize(10)->setFontColor('334155'));
        }
        $topRows[] = Row::fromValues([$title], (new Style())->setFontBold()->setFontSize(14)->setFontColor(CustomReportLayout::argb($colors['title'])));
        $infoLine = implode(' · ', array_filter([
            $layout['header']['show_filters'] ? $subtitle : null,
            $layout['footer']['show_generated'] ? CustomReportLayout::generatedText($branding) : null,
        ]));
        if ($infoLine !== '') {
            $topRows[] = Row::fromValues([$infoLine], (new Style())->setFontSize(9)->setFontColor('64748B'));
        }
        $topRows[] = Row::fromValues([]);

        // Header row sits right after the top block and stays visible while scrolling.
        // "No lines" also hides Excel's own gridlines.
        $sheet->setSheetView(
            (new SheetView())
                ->setFreezeRow(count($topRows) + 2)
                ->setShowGridLines($layout['table_lines'] !== 'none')
        );

        $this->footerLines = CustomReportLayout::textLines($layout['footer']['text'], $branding);

        // Stripes and grid borders style every cell of a row, which slows very large exports;
        // they are applied up to MAX_STYLED_ROWS rows.
        $border = $layout['table_lines'] === 'grid' ? $this->gridBorder($colors['border']) : null;
        if ($totalRows <= self::MAX_STYLED_ROWS) {
            $stripe = $colors['stripe_bg'] !== '' ? CustomReportLayout::argb($colors['stripe_bg']) : null;
            $this->evenRowStyle = $border ? (new Style())->setBorder($border) : null;
            if ($stripe || $border) {
                $this->oddRowStyle = new Style();
                if ($stripe) {
                    $this->oddRowStyle->setBackgroundColor($stripe);
                }
                if ($border) {
                    $this->oddRowStyle->setBorder($border);
                }
            }
        }

        foreach ($columns as $index => $column) {
            $format = $column['format'] ?? 'text';
            $align = $column['align'] ?? 'left';
            // Styling every cell is the main cost in openspout, so only style what needs it:
            // Excel already right-aligns numbers and left-aligns text.
            $style = null;
            if ($format === 'money') {
                $style = (new Style())->setFormat('#,##0.00');
            } elseif ($format === 'date') {
                $style = (new Style())->setFormat('yyyy-mm-dd');
            }
            if ($format === 'text' && ($align !== 'left' || $layout['wrap_text'])) {
                $style = (new Style())->setCellAlignment($this->alignment($align));
                if ($layout['wrap_text']) {
                    $style->setShouldWrapText();
                }
            }

            $this->columns[] = ['key' => $column['key'], 'format' => $format, 'style' => $style];
            $width = $this->columnWidth($column, $sampleRows);
            // Wrapped text columns stay narrower so long values continue on the next line.
            $sheet->setColumnWidth($layout['wrap_text'] && $format === 'text' ? min($width, 40.0) : $width, $index + 1);
        }

        $this->writer->addRows($topRows);
        $headerStyle = (new Style())
            ->setFontBold()
            ->setFontColor(CustomReportLayout::argb($colors['header_text']))
            ->setBackgroundColor(CustomReportLayout::argb($colors['header_bg']));
        if ($border) {
            $headerStyle->setBorder($border);
        }
        $this->writer->addRow(Row::fromValues(
            array_map(fn ($column) => $column['label'] ?? $column['key'], $columns),
            $headerStyle
        ));
    }

    public function write(array $row): void
    {
        $cells = [];
        foreach ($this->columns as $column) {
            $cells[] = Cell::fromValue($this->value($row[$column['key']] ?? null, $column['format']), $column['style']);
        }
        $style = $this->rowIndex++ % 2 === 1 ? $this->oddRowStyle : $this->evenRowStyle;
        $this->writer->addRow(new Row($cells, $style));
    }

    private function gridBorder(string $hex): Border
    {
        $color = CustomReportLayout::argb($hex);

        return new Border(
            new BorderPart(Border::TOP, $color, Border::WIDTH_THIN, Border::STYLE_SOLID),
            new BorderPart(Border::RIGHT, $color, Border::WIDTH_THIN, Border::STYLE_SOLID),
            new BorderPart(Border::BOTTOM, $color, Border::WIDTH_THIN, Border::STYLE_SOLID),
            new BorderPart(Border::LEFT, $color, Border::WIDTH_THIN, Border::STYLE_SOLID),
        );
    }

    public function finish(?string $note = null, array $totals = []): void
    {
        if ($totals) {
            $this->writeTotals($totals);
        }
        if ($note) {
            $this->writer->addRow(Row::fromValues([]));
            $this->writer->addRow(Row::fromValues([$note], (new Style())->setFontColor('B45309')));
        }
        if ($this->footerLines) {
            $this->writer->addRow(Row::fromValues([]));
            foreach ($this->footerLines as $line) {
                $this->writer->addRow(Row::fromValues([$line], (new Style())->setFontSize(9)->setFontColor('64748B')));
            }
        }
        $this->writer->close();
    }

    /** Bold "Total" row; the label goes in the first non-total column. */
    private function writeTotals(array $totals): void
    {
        $labelWritten = false;
        $cells = [];
        foreach ($this->columns as $column) {
            $style = (new Style())->setFontBold()->setBorder(new Border(
                new BorderPart(Border::TOP, '475569', Border::WIDTH_THIN, Border::STYLE_SOLID),
                new BorderPart(Border::BOTTOM, '475569', Border::WIDTH_MEDIUM, Border::STYLE_DOUBLE),
            ));
            if (array_key_exists($column['key'], $totals)) {
                if ($column['format'] === 'money') {
                    $style->setFormat('#,##0.00');
                }
                $cells[] = Cell::fromValue($this->value($totals[$column['key']], $column['format']), $style);
            } elseif (!$labelWritten) {
                $labelWritten = true;
                $cells[] = Cell::fromValue('Total', $style);
            } else {
                $cells[] = Cell::fromValue(null, $style);
            }
        }
        $this->writer->addRow(new Row($cells));
    }

    /** Excel print footer: custom text left, "Page X of Y" right (& is Excel's code prefix). */
    private function printFooter(array $layout, array $branding): string
    {
        $escape = fn (string $text) => str_replace('&', '&&', $text);
        $left = implode(' ', CustomReportLayout::textLines($layout['footer']['text'], $branding));
        $parts = [];
        if ($left !== '') {
            $parts[] = '&L' . $escape(mb_substr($left, 0, 120));
        }
        if ($layout['footer']['show_page_numbers']) {
            $parts[] = '&RPage &P of &N';
        }

        // openspout writes this string into the sheet XML as-is, so it must be XML-escaped
        // ("&L" becomes "&amp;L", which Excel reads back as its left-section code).
        return htmlspecialchars(implode('', $parts), ENT_XML1 | ENT_QUOTES, 'UTF-8');
    }

    private function value(mixed $value, string $format): mixed
    {
        if ($value === null || $value === '') {
            return null;
        }

        if ($format === 'money' || $format === 'number') {
            return is_numeric($value) ? $value + 0 : (string) $value;
        }

        if ($format === 'date') {
            $key = (string) $value;
            if (!isset($this->dateCache[$key])) {
                if (count($this->dateCache) > 5000) {
                    $this->dateCache = [];
                }
                $this->dateCache[$key] = DateTimeImmutable::createFromFormat('!Y-m-d', substr($key, 0, 10)) ?: $key;
            }
            return $this->dateCache[$key];
        }

        return is_bool($value) ? (int) $value : (is_int($value) || is_float($value) ? $value : (string) $value);
    }

    private function alignment(string $align): string
    {
        return match ($align) {
            'right' => CellAlignment::RIGHT,
            'center' => CellAlignment::CENTER,
            default => CellAlignment::LEFT,
        };
    }

    private function columnWidth(array $column, array $sampleRows): float
    {
        $width = mb_strlen((string) ($column['label'] ?? $column['key']));
        foreach ($sampleRows as $row) {
            $width = max($width, mb_strlen((string) ($row[$column['key']] ?? '')));
        }

        if (($column['format'] ?? 'text') === 'money') {
            $width += 4; // thousands separators
        }

        return (float) min(max($width + 2, 10), 60);
    }
}
