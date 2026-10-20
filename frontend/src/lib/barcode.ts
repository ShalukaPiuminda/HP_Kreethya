/** Mirrors the backend: drop scanner control characters (CR/LF/TAB/GS) and trim. */
export function normalizeBarcode(value: string): string {
  return value.replace(/[\x00-\x1F\x7F]+/g, '').trim();
}

/** UPC-A (12 digits) and its EAN-13 form with a leading zero are the same product. */
export function barcodeVariants(code: string): string[] {
  const variants = [code];

  if (/^\d{12}$/.test(code)) {
    variants.push(`0${code}`);
  } else if (/^0\d{12}$/.test(code)) {
    variants.push(code.slice(1));
  }

  return variants;
}

/**
 * Exact match of a scanned value against the loaded items: product barcode first,
 * then the item code (internal labels). Never a partial match.
 */
export function findItemByScan<T extends { item_code: string; barcode?: string | null }>(
  items: T[],
  rawCode: string
): T | undefined {
  const code = normalizeBarcode(rawCode);
  if (!code) return undefined;

  const variants = barcodeVariants(code).map((variant) => variant.toLowerCase());
  const byBarcode = items.find(
    (item) => item.barcode && variants.includes(item.barcode.toLowerCase())
  );
  if (byBarcode) return byBarcode;

  const lowerCode = code.toLowerCase();
  return items.find((item) => item.item_code.toLowerCase() === lowerCode);
}
