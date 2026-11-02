'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { FileChartColumn } from 'lucide-react';
import { CustomReportView } from '@/components/custom-report-view';
import { OperationHeader, OperationNotice } from '@/components/operation-ui';
import { ReportBreadcrumb } from '@/components/report-breadcrumb';
import { api, getApiErrorMessage } from '@/lib/api';
import { useFilterOptions, type CustomReportParam, type PublishedCustomReport } from '@/lib/custom-reports';
import { UNCATEGORIZED } from '@/lib/report-catalog';

const NO_PARAMETERS: CustomReportParam[] = [];

export default function CustomReportPage() {
  const params = useParams<{ slug: string }>();
  const slug = decodeURIComponent(params.slug);
  const [report, setReport] = useState<PublishedCustomReport | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    api
      .get<PublishedCustomReport[]>('/v1/reports/custom')
      .then((response) => {
        if (cancelled) return;
        const found = (response.data || []).find((entry) => entry.slug === slug) ?? null;
        setReport(found);
        setStatus(found ? 'ready' : 'missing');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getApiErrorMessage(err));
        setStatus('missing');
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const category = report?.category?.trim() || UNCATEGORIZED;
  const filterOptions = useFilterOptions(report?.parameters ?? NO_PARAMETERS, '/v1/reports/filter-options');

  return (
    <div className="space-y-6">
      <ReportBreadcrumb category={report ? category : null} name={report?.name} />

      {status === 'loading' && (
        <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-slate-400">
          Loading report...
        </div>
      )}

      {status === 'missing' && (
        error ? (
          <OperationNotice type="error">{error}</OperationNotice>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-slate-500">
            This report does not exist or is no longer published.
          </div>
        )
      )}

      {report && (
        <>
          <OperationHeader
            eyebrow={category}
            title={report.name}
            description={report.description || 'Use the filters below, then export to Excel or PDF.'}
            icon={FileChartColumn}
          />
          <CustomReportView key={report.slug} report={report} options={filterOptions} />
        </>
      )}
    </div>
  );
}
