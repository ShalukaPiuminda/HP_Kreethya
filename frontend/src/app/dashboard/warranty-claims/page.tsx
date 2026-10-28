'use client';

import { useEffect, useState } from 'react';
import { WarrantyClaimsPanel } from '@/components/warranty-claims-panel';

export default function WarrantyClaimsPage() {
  const [focus, setFocus] = useState<{ claimId: number | null; action: 'handover' | 'detail' | null } | null>(null);

  // Read ?claim=&action= without useSearchParams so the page can stay statically rendered.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const timer = window.setTimeout(() => setFocus({
      claimId: params.get('claim') ? Number(params.get('claim')) : null,
      action: params.get('action') === 'handover' ? 'handover' : params.get('claim') ? 'detail' : null,
    }), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return <WarrantyClaimsPanel focusClaimId={focus?.claimId ?? null} focusAction={focus?.action ?? null} />;
}
