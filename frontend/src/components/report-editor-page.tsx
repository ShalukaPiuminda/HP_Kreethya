'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { OperationNotice } from '@/components/operation-ui';
import { categoryChoices, draftFromReport, emptyDraft, ReportEditor, type ReportDraft } from '@/components/report-editor';
import { api, getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { CustomReport } from '@/lib/custom-reports';

/** Full-page Report Builder editor: /dashboard/report-builder/new and /dashboard/report-builder/[id]. */
export function ReportEditorPage({ reportId }: { reportId: number | null }) {
  const router = useRouter();
  const { hasPermission } = useAuth();
  const canRead = hasPermission('report-builder', 'can_read');
  const canCreate = hasPermission('report-builder', 'can_create');
  const canUpdate = hasPermission('report-builder', 'can_update');

  const [draft, setDraft] = useState<ReportDraft | null>(reportId === null ? emptyDraft() : null);
  const [categories, setCategories] = useState<string[]>(categoryChoices([]));
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(reportId);
  // On the server, reports that come from project files are view-only.
  const [fileLocked, setFileLocked] = useState<string | null>(null);

  useEffect(() => {
    if (!canRead) return;
    let cancelled = false;

    api
      .get<CustomReport[]>('/v1/report-builder')
      .then((response) => {
        if (!cancelled) setCategories(categoryChoices(response.data || []));
      })
      .catch(() => undefined);

    if (reportId !== null) {
      api
        .get<CustomReport>(`/v1/report-builder/${reportId}`)
        .then((response) => {
          if (cancelled || !response.data) return;
          setDraft(draftFromReport(response.data));
          if (response.data.from_file && response.data.files_writable === false) {
            setFileLocked(response.data.file_path ?? 'backend/resources/reports');
          }
        })
        .catch((err) => {
          if (!cancelled) setError(getApiErrorMessage(err, 'This report could not be loaded.'));
        });
    }

    return () => {
      cancelled = true;
    };
  }, [canRead, reportId]);

  if (!canRead) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-slate-500">
        <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-slate-300" />
        You do not have access to the Report Builder.
      </div>
    );
  }

  if (error) {
    return <OperationNotice type="error">{error}</OperationNotice>;
  }

  if (!draft) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-slate-400">
        Loading report...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {fileLocked && (
        <OperationNotice type="warning">
          This report comes from the project file <code>{fileLocked}</code>, so it is view-only on this server. Edit it on the
          development PC and deploy the updated file. You can still preview it and use Test PDF / Test Excel here.
        </OperationNotice>
      )}
    <ReportEditor
      initial={draft}
      categories={categories}
      readOnly={fileLocked !== null || (editingId === null ? !canCreate : !canUpdate)}
      onBack={() => router.push('/dashboard/report-builder')}
      onSaved={(report, created) => {
        // A newly created category becomes available in the picker straight away.
        const category = report.category?.trim();
        if (category) {
          setCategories((current) =>
            current.some((name) => name.toLowerCase() === category.toLowerCase()) ? current : [...current, category]
          );
        }
        if (created) {
          // Switch the address to the edit page without reloading (keeps the preview on screen).
          setEditingId(report.id);
          window.history.replaceState(null, '', `/dashboard/report-builder/${report.id}`);
        }
      }}
    />
    </div>
  );
}
