import { numeric, type PurchaseReceipt } from './purchases';

/** A4 sticker sheet layout, all sizes in mm. */
export interface LabelSheetPreset {
  id: string;
  name: string;
  columns: number;
  rows: number;
  labelWidth: number;
  labelHeight: number;
  marginTop: number;
  marginLeft: number;
  columnGap: number;
  rowGap: number;
}

export const LABEL_SHEET_PRESETS: LabelSheetPreset[] = [
  { id: 'a4-21', name: 'A4 21 labels (3 x 7, 63.5 x 38.1 mm)', columns: 3, rows: 7, labelWidth: 63.5, labelHeight: 38.1, marginTop: 15.15, marginLeft: 7.2, columnGap: 2.5, rowGap: 0 },
  { id: 'a4-24', name: 'A4 24 labels (3 x 8, 70 x 37 mm)', columns: 3, rows: 8, labelWidth: 70, labelHeight: 37, marginTop: 0.5, marginLeft: 0, columnGap: 0, rowGap: 0 },
  { id: 'a4-40', name: 'A4 40 labels (4 x 10, 48.5 x 25.4 mm)', columns: 4, rows: 10, labelWidth: 48.5, labelHeight: 25.4, marginTop: 21.5, marginLeft: 8, columnGap: 0, rowGap: 0 },
  { id: 'a4-65', name: 'A4 65 labels (5 x 13, 38.1 x 21.2 mm)', columns: 5, rows: 13, labelWidth: 38.1, labelHeight: 21.2, marginTop: 10.7, marginLeft: 4.75, columnGap: 2.5, rowGap: 0 },
];

export const DEFAULT_LABEL_PRESET_ID = 'a4-24';

export interface SerialLabel {
  serial: string;
  itemCode: string;
  description: string;
  batchNo: string | null;
  price: number;
  grnNo: string;
}

/** One label per serial number on the selected GRN lines. */
export function buildSerialLabels(receipt: PurchaseReceipt, selectedDetailIds: Set<number>): SerialLabel[] {
  return receipt.details
    .filter((detail) => selectedDetailIds.has(detail.id))
    .flatMap((detail) => {
      const price = numeric(detail.Sales_price) || numeric(detail.item?.standard_sales_price);

      return (detail.serial_numbers ?? []).map((serial) => ({
        serial,
        itemCode: detail.Item_code,
        description: detail.Item_description || detail.item?.item_description || detail.Item_code,
        batchNo: detail.batch_no || null,
        price,
        grnNo: receipt.Invoice_no,
      }));
    });
}

/**
 * Splits labels into A4 pages. startPosition (1-based) leaves the first cells blank
 * so a partly used sticker sheet can be fed back into the printer.
 */
export function paginateLabels(
  labels: SerialLabel[],
  preset: LabelSheetPreset,
  startPosition: number
): (SerialLabel | null)[][] {
  const perPage = preset.columns * preset.rows;
  const skip = Math.min(Math.max(Math.floor(startPosition) - 1, 0), perPage - 1);
  const cells: (SerialLabel | null)[] = [...Array<null>(skip).fill(null), ...labels];
  const pages: (SerialLabel | null)[][] = [];

  for (let index = 0; index < cells.length; index += perPage) {
    pages.push(cells.slice(index, index + perPage));
  }

  return labels.length > 0 ? pages : [];
}

const PRESET_STORAGE_KEY = 'barcode-label-preset';

export function loadSavedPresetId(): string {
  try {
    const saved = window.localStorage.getItem(PRESET_STORAGE_KEY);
    return LABEL_SHEET_PRESETS.some((preset) => preset.id === saved) ? (saved as string) : DEFAULT_LABEL_PRESET_ID;
  } catch {
    return DEFAULT_LABEL_PRESET_ID;
  }
}

export function savePresetId(presetId: string) {
  try {
    window.localStorage.setItem(PRESET_STORAGE_KEY, presetId);
  } catch {
    // Storage blocked (private window etc.); the default preset is used next time.
  }
}
