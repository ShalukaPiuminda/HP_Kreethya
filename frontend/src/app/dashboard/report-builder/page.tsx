'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileCode2, Pencil, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { LoadingTableRow, OperationHeader, OperationNotice, StatusPill } from '@/components/operation-ui';
import { api, getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { CustomReport } from '@/lib/custom-reports';

export default function ReportBuilderPage() {
  const { hasPermission } = useAuth();
  const router = useRouter();
  const canRead = hasPermission('report-builder', 'can_read');
  const canCreate = hasPermission('report-builder', 'can_create');
  const canDelete = hasPermission('report-builder', 'can_delete');

  const [reports, setReports] = useState<CustomReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api.get<CustomReport[]>('/v1/report-builder');
      setReports(response.data || []);
    } catch (error) {
      setNotice({ type: 'error', text: getApiErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canRead) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [canRead, load]);

  async function remove(report: CustomReport) {
    if (!window.confirm(`Delete the report "${report.name}"? It will be removed from the Reports tab.`)) return;
    try {
      await api.delete(`/v1/report-builder/${report.id}`);
      setNotice({ type: 'success', text: 'Report deleted.' });
      void load();
    } catch (error) {
      setNotice({ type: 'error', text: getApiErrorMessage(error) });
    }
  }

  if (!canRead) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-slate-500">
        <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-slate-300" />
        You do not have access to the Report Builder.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OperationHeader
        eyebrow="Developers"
        title="Report Builder"
        description="Write SQL reports with filters and columns. Published reports appear on the Show Reports page under their category, with PDF and Excel export."
        icon={FileCode2}
        actions={
          canCreate ? (
            <button
              type="button"
              onClick={() => router.push('/dashboard/report-builder/new')}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4" />
              New report
            </button>
          ) : null
        }
      />

      {notice && <OperationNotice type={notice.type}>{notice.text}</OperationNotice>}

      {reports.some((report) => report.from_file && report.files_writable === false) && (
        <OperationNotice type="warning">
          Reports marked <strong>File</strong> come from the project files (backend/resources/reports) and are view-only on this
          server. Edit them on the development PC and deploy the updated files.
        </OperationNotice>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="content-scrollbar overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">Report</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Filters</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Last edited</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <LoadingTableRow columns={6} label="Loading reports..." />
              ) : reports.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-14 text-center text-slate-400">
                    No custom reports yet. Click “New report” to create one.
                  </td>
                </tr>
              ) : (
                reports.map((report) => (
                  <tr key={report.id} className="align-top hover:bg-slate-50/70">
                    <td className="px-5 py-4">
                      <Link href={`/dashboard/report-builder/${report.id}`} className="font-semibold text-slate-900 hover:text-indigo-700">
                        {report.name}
                      </Link>
                      {report.description && <div className="mt-0.5 text-xs text-slate-500">{report.description}</div>}
                    </td>
                    <td className="px-5 py-4 text-slate-600">{report.category || '—'}</td>
                    <td className="px-5 py-4 text-slate-600">
                      {report.parameters?.length ? report.parameters.map((param) => param.label || param.name).join(', ') : '—'}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <StatusPill status={report.is_published ? 'active' : 'draft'} />
                        {report.from_file && (
                          <span
                            title={report.file_path ?? undefined}
                            className="inline-flex rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-inset ring-sky-200"
                          >
                            File
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-500">
                      {new Date(report.updated_at).toLocaleString('en-LK')}
                      <div>{report.UID}</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/dashboard/report-builder/${report.id}`}
                          className="rounded-lg p-2 text-slate-500 hover:bg-indigo-50 hover:text-indigo-700"
                          aria-label="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                        {canDelete && !(report.from_file && report.files_writable === false) && (
                          <button
                            type="button"
                            onClick={() => void remove(report)}
                            className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                            aria-label="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}
