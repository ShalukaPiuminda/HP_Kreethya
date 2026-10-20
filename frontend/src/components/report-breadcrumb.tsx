import Link from 'next/link';
import { ArrowLeft, ChevronRight } from 'lucide-react';

/** "Show Reports › Category › Report" bar shown at the top of every report page. */
export function ReportBreadcrumb({ category, name }: { category?: string | null; name?: string }) {
  return (
    <nav className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm" aria-label="Breadcrumb">
      <Link
        href="/dashboard/reports"
        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-semibold text-indigo-600 transition hover:bg-indigo-50"
      >
        <ArrowLeft className="h-4 w-4" />
        Show Reports
      </Link>
      {category && (
        <>
          <ChevronRight className="h-4 w-4 text-slate-300" />
          <Link
            href={`/dashboard/reports?category=${encodeURIComponent(category)}`}
            className="rounded-lg px-2 py-1 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            {category}
          </Link>
        </>
      )}
      {name && (
        <>
          <ChevronRight className="h-4 w-4 text-slate-300" />
          <span className="px-2 py-1 font-semibold text-slate-800">{name}</span>
        </>
      )}
    </nav>
  );
}
