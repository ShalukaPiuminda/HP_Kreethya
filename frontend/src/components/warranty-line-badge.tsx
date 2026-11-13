'use client';

import { ShieldCheck, ShieldOff } from 'lucide-react';
import { Badge } from '@/components/invoice-form-ui';
import { formatDate, formatPeriod, warrantyExpiry, type WarrantyUnit } from '@/lib/warranty';

/**
 * Warranty the customer gets for an item on a sales / HP line, counted from the invoice date.
 * Hover shows the warranty terms.
 */
export function WarrantyLineBadge({
  item,
  saleDate,
}: {
  item: {
    has_warranty?: boolean;
    warranty_period?: number | null;
    warranty_unit?: WarrantyUnit | null;
    warranty_terms?: string | null;
  };
  saleDate: string;
}) {
  if (!item.has_warranty || !item.warranty_period) {
    return <Badge icon={ShieldOff}>No warranty</Badge>;
  }

  const expiry = warrantyExpiry(saleDate, item.warranty_period, item.warranty_unit);

  return (
    <span title={item.warranty_terms ?? undefined}>
      <Badge icon={ShieldCheck} tone="emerald">
        Warranty {formatPeriod(item.warranty_period, item.warranty_unit)}
        {expiry ? ` · until ${formatDate(expiry)}` : ''}
      </Badge>
    </span>
  );
}
