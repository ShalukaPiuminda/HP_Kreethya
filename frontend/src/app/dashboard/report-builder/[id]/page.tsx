'use client';

import { useParams } from 'next/navigation';
import { ReportEditorPage } from '@/components/report-editor-page';

export default function EditCustomReportPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-slate-500">
        This report does not exist.
      </div>
    );
  }

  return <ReportEditorPage key={id} reportId={id} />;
}
