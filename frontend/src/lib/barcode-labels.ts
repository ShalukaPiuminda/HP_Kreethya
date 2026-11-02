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

export interface BarcodeLabelData {
  /** Value encoded in the barcode: the unit's serial, or the item barcode / item code. */
  barcode: string;
  /** Set only for serialized units. */
  serial: string | null;
  itemCode: string;
  description: string;
  batchNo: string | null;
  price: number;
  grnNo: string;
}

type ReceiptDetail = PurchaseReceipt['details'][number];

export function isSerialDetail(detail: ReceiptDetail): boolean {
  return (detail.serial_numbers?.length ?? 0) > 0;
}

/** Labels a line prints by default: one per serial, or one per received unit (qty + free). */
export function defaultLabelCount(detail: ReceiptDetail): number {
  return isSerialDetail(detail)
    ? detail.serial_numbers?.length ?? 0
    : Math.max(0, numeric(detail.QTY) + numeric(detail.free_qty));
}

/**
 * Serialized lines: one label per serial, barcode = serial number.
 * Other lines: `copies` labels (default qty + free), barcode = item barcode, else item code.
 */
export function buildLabels(
  receipt: PurchaseReceipt,
  selectedDetailIds: Set<number>,
  copies: Record<number, number>
): BarcodeLabelData[] {
  return receipt.details
    .filter((detail) => selectedDetailIds.has(detail.id))
    .flatMap((detail): BarcodeLabelData[] => {
      const base = {
        itemCode: detail.Item_code,
        description: detail.Item_description || detail.item?.item_description || detail.Item_code,
        batchNo: detail.batch_no || null,
        price: numeric(detail.Sales_price) || numeric(detail.item?.standard_sales_price),
        grnNo: receipt.Invoice_no,
      };

      if (isSerialDetail(detail)) {
        return (detail.serial_numbers ?? []).map((serial) => ({ ...base, barcode: serial, serial }));
      }

      const count = Math.max(0, Math.floor(copies[detail.id] ?? defaultLabelCount(detail)));
      const barcode = detail.item?.barcode || detail.Item_code;

      return Array.from({ length: count }, () => ({ ...base, barcode, serial: null }));
    });
}

/**
 * Splits labels into A4 pages. startPosition (1-based) leaves the first cells blank
 * so a partly used sticker sheet can be fed back into the printer.
 */
export function paginateLabels(
  labels: BarcodeLabelData[],
  preset: LabelSheetPreset,
  startPosition: number
): (BarcodeLabelData | null)[][] {
  const perPage = preset.columns * preset.rows;
  const skip = Math.min(Math.max(Math.floor(startPosition) - 1, 0), perPage - 1);
  const cells: (BarcodeLabelData | null)[] = [...Array<null>(skip).fill(null), ...labels];
  const pages: (BarcodeLabelData | null)[][] = [];

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
