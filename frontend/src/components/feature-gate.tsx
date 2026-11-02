'use client';

import { LockKeyhole, Phone, Mail, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import type { FeatureKey } from '@/lib/auth-types';

export const FEATURE_INFO: Record<FeatureKey, { label: string; description: string }> = {
  sms: {
    label: 'SMS Notifications',
    description:
      'Automatically text customers when they pay an installment or invoice, remind them before the due date, and alert them about arrears.',
  },
};

// Vendor contact shown on locked features. Override in frontend .env.local.
const VENDOR_PHONE = process.env.NEXT_PUBLIC_VENDOR_PHONE || '';
const VENDOR_EMAIL = process.env.NEXT_PUBLIC_VENDOR_EMAIL || '';

export function FeatureLockedPanel({ feature }: { feature: FeatureKey }) {
  const info = FEATURE_INFO[feature];

  return (
    <div className="mx-auto max-w-2xl rounded-3xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-white p-10 text-center shadow-sm">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 ring-1 ring-inset ring-amber-200">
        <LockKeyhole className="h-8 w-8" />
      </span>
      <p className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-amber-700">
        <Sparkles className="h-3.5 w-3.5" />
        Premium feature
      </p>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{info.label}</h1>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">{info.description}</p>
      <p className="mx-auto mt-6 max-w-lg text-sm font-semibold text-slate-800">
        This feature is not activated for your system. Contact us to enable it.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3 text-sm">
        {VENDOR_PHONE && (
          <a
            href={`tel:${VENDOR_PHONE}`}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Phone className="h-4 w-4" />
            {VENDOR_PHONE}
          </a>
        )}
        {VENDOR_EMAIL && (
          <a
            href={`mailto:${VENDOR_EMAIL}?subject=${encodeURIComponent(`Enable ${info.label}`)}`}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white shadow-sm hover:bg-slate-800"
          >
            <Mail className="h-4 w-4" />
            {VENDOR_EMAIL}
          </a>
        )}
      </div>
    </div>
  );
}

/** Renders children only when the paid feature is enabled for this system. */
export function FeatureGate({ feature, children }: { feature: FeatureKey; children: React.ReactNode }) {
  const { featureEnabled } = useAuth();

  if (!featureEnabled(feature)) {
    return <FeatureLockedPanel feature={feature} />;
  }

  return <>{children}</>;
}
