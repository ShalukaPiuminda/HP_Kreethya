import type { PublishedCustomReport } from '@/lib/custom-reports';

export type BuiltInReportKey =
  | 'overview'
  | 'trial'
  | 'day-end'
  | 'stock-in-hand'
  | 'bin-card'
  | 'grn'
  | 'sales'
  | 'hire-purchase'
  | 'cash-in-out';

export interface BuiltInReport {
  key: BuiltInReportKey;
  name: string;
  /** Null for standalone reports that are not listed under a category (opened from a header button). */
  category: string | null;
  description: string;
}

/** Built-in reports, in the order they are listed inside each category. */
export const BUILT_IN_REPORTS: BuiltInReport[] = [
  { key: 'overview', name: 'Overview', category: null, description: 'Sales, purchases, collections and cash position for a period.' },
  { key: 'trial', name: 'Trial Balance', category: 'Financial', description: 'Debit and credit balances of every account as of a date.' },
  { key: 'cash-in-out', name: 'Cash In / Out', category: 'Financial', description: 'Cash and bank movements with running balance.' },
  { key: 'day-end', name: 'Day End', category: 'Financial', description: 'Closed business days and their balances.' },
  { key: 'stock-in-hand', name: 'Stock In Hand', category: 'Inventory', description: 'Current stock by item, store, batch and serial.' },
  { key: 'bin-card', name: 'Bin Card', category: 'Inventory', description: 'Every stock movement of one item with running quantity.' },
  { key: 'grn', name: 'GRN / Purchases', category: 'Inventory', description: 'Goods received from suppliers, summary or detail.' },
  { key: 'sales', name: 'Sales', category: 'Sales & Hire Purchase', description: 'Invoices by customer, item and store, summary or detail.' },
  { key: 'hire-purchase', name: 'Hire Purchase', category: 'Sales & Hire Purchase', description: 'Hire purchase agreements, collections and balances.' },
];

export const CATEGORY_ORDER = ['Financial', 'Inventory', 'Sales & Hire Purchase'];
export const UNCATEGORIZED = 'Other Reports';

export function builtInReport(key: string | undefined): BuiltInReport | undefined {
  return BUILT_IN_REPORTS.find((report) => report.key === key);
}

export interface CatalogEntry {
  id: string;
  name: string;
  description: string | null;
  href: string;
  custom: boolean;
}

export interface CatalogCategory {
  name: string;
  reports: CatalogEntry[];
}

/**
 * Group built-in and custom reports by category. Custom reports whose category matches a
 * built-in category (case-insensitive) join it; other categories follow alphabetically.
 */
export function buildCatalog(customReports: PublishedCustomReport[]): CatalogCategory[] {
  const categories = new Map<string, CatalogCategory>();
  const categoryFor = (name: string) => {
    const key = name.trim().toLowerCase();
    let category = categories.get(key);
    if (!category) {
      category = { name: name.trim(), reports: [] };
      categories.set(key, category);
    }
    return category;
  };

  for (const report of BUILT_IN_REPORTS) {
    if (!report.category) continue;
    categoryFor(report.category).reports.push({
      id: report.key,
      name: report.name,
      description: report.description,
      href: `/dashboard/reports/${report.key}`,
      custom: false,
    });
  }

  for (const report of customReports) {
    categoryFor(report.category?.trim() || UNCATEGORIZED).reports.push({
      id: `custom-${report.id}`,
      name: report.name,
      description: report.description,
      href: `/dashboard/reports/custom/${encodeURIComponent(report.slug)}`,
      custom: true,
    });
  }

  const rank = (name: string) => {
    const index = CATEGORY_ORDER.findIndex((entry) => entry.toLowerCase() === name.toLowerCase());
    if (index >= 0) return index;
    return name === UNCATEGORIZED ? Number.MAX_SAFE_INTEGER : CATEGORY_ORDER.length;
  };

  return [...categories.values()].sort(
    (left, right) => rank(left.name) - rank(right.name) || left.name.localeCompare(right.name)
  );
}
