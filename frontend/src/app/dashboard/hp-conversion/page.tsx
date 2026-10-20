'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, RefreshCcw } from 'lucide-react';
import {
  LoadingTableRow,
  OperationHeader,
  OperationMetric,
  OperationNotice,
  StatusPill,
} from '@/components/operation-ui';
import { api, getApiErrorMessage } from '@/lib/api';
import { type HpAgreement, money, shortDate } from '@/lib/hp';

export default function HpConversionPage() {
  const [agreements, setAgreements] = useState<HpAgreement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const response = await api.getAll<HpAgreement>('/v1/hp?status=converted');
        setAgreements(response.data || []);
      } catch (loadError) {
        setError(getApiErrorMessage(loadError));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const settled = agreements.reduce((total, agreement) => total + Number(agreement.conversions?.[0]?.amount || 0), 0);
  const discounts = agreements.reduce((total, agreement) => total + Number(agreement.conversions?.[0]?.discount || 0), 0);

  return (
    <div className="space-y-6">
      <OperationHeader
        eyebrow="Settlement Control"
        title="HP to Cash Conversion"
        description="Review agreements closed through a controlled outstanding-balance settlement. New conversions are initiated from the agreement workspace."
        icon={RefreshCcw}
        actions={<Link href="/dashboard/hire-purchase" className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white">Open agreements <ArrowRight className="h-4 w-4" /></Link>}
      />
      {error && <OperationNotice type="error">{error}</OperationNotice>}
      <section className="grid gap-4 sm:grid-cols-3">
        <OperationMetric label="Converted agreements" value={String(agreements.length)} tone="indigo" />
        <OperationMetric label="Cash settlements" value={money(settled)} tone="emerald" />
        <OperationMetric label="Approved discounts" value={money(discounts)} tone="amber" />
      </section>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="content-scrollbar overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Agreement</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Conversion date</th><th className="px-5 py-3">Settlement</th><th className="px-5 py-3">Discount</th><th className="px-5 py-3">Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? <LoadingTableRow columns={6} label="Loading conversions..." /> : agreements.length === 0 ? <tr><td colSpan={6} className="px-5 py-14 text-center text-slate-400">No agreements have been converted.</td></tr> : agreements.map((agreement) => {
                const conversion = agreement.conversions?.[0];
                return <tr key={agreement.id}><td className="px-5 py-4 font-semibold">{agreement.agreement_no}</td><td className="px-5 py-4"><div>{agreement.customer_name}</div><div className="text-xs text-slate-500">{agreement.customer_nic}</div></td><td className="px-5 py-4">{shortDate(conversion?.conversion_date)}</td><td className="px-5 py-4 font-semibold text-emerald-700">{money(conversion?.amount)}</td><td className="px-5 py-4">{money(conversion?.discount)}</td><td className="px-5 py-4"><StatusPill status={agreement.status} /></td></tr>;
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
