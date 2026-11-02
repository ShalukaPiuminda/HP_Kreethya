'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Boxes,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderClosed,
  FolderOpen,
  Landmark,
  LayoutDashboard,
  Search,
  ShoppingCart,
  type LucideIcon,
} from 'lucide-react';
import { OperationHeader } from '@/components/operation-ui';
import { api } from '@/lib/api';
import type { PublishedCustomReport } from '@/lib/custom-reports';
import { buildCatalog, type CatalogCategory } from '@/lib/report-catalog';

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  financial: Landmark,
  inventory: Boxes,
  'sales & hire purchase': ShoppingCart,
};

export default function ShowReportsPage() {
  return (
    <Suspense fallback={null}>
      <ShowReports />
    </Suspense>
  );
}

function ShowReports() {
  const searchParams = useSearchParams();
  const [customReports, setCustomReports] = useState<PublishedCustomReport[]>([]);
  const [loadingCustom, setLoadingCustom] = useState(true);
  const [search, setSearch] = useState('');
  // Categories opened from a breadcrumb link (?category=...) start expanded.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = searchParams.get('category');
    return new Set(initial ? [initial.toLowerCase()] : []);
  });

  useEffect(() => {
    let cancelled = false;
    api
      .get<PublishedCustomReport[]>('/v1/reports/custom')
      .then((response) => {
        if (!cancelled) setCustomReports(response.data || []);
      })
      .catch(() => {
        // Custom reports are optional; built-in reports are always listed.
        if (!cancelled) setCustomReports([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingCustom(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const catalog = useMemo(() => buildCatalog(customReports), [customReports]);

  const term = search.trim().toLowerCase();
  const visible: CatalogCategory[] = useMemo(() => {
    if (!term) return catalog;
    return catalog
      .map((category) =>
        category.name.toLowerCase().includes(term)
          ? category
          : {
              ...category,
              reports: category.reports.filter((report) =>
                `${report.name} ${report.description ?? ''}`.toLowerCase().includes(term)
              ),
            }
      )
      .filter((category) => category.reports.length > 0);
  }, [catalog, term]);

  const totalReports = catalog.reduce((sum, category) => sum + category.reports.length, 0);
  const isOpen = (name: string) => Boolean(term) || expanded.has(name.toLowerCase());

  function toggle(name: string) {
    setExpanded((current) => {
      const next = new Set(current);
      const key = name.toLowerCase();
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <OperationHeader
        eyebrow="Business Intelligence"
        title="Show Reports"
        description="Choose a category to see its reports. Every report can be filtered and exported to Excel or PDF."
        icon={ChartNoAxesCombined}
        actions={
          <Link
            href="/dashboard/reports/overview"
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          >
            <LayoutDashboard className="h-4 w-4" />
            Overview
          </Link>
        }
      />

      <section className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search reports..."
            className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm"
          />
        </label>
        <div className="flex items-center gap-2 text-xs">
          <span className="mr-1 text-slate-500">
            {catalog.length} categories · {totalReports} reports
            {loadingCustom && ' · loading...'}
          </span>
          <button
            type="button"
            onClick={() => setExpanded(new Set(catalog.map((category) => category.name.toLowerCase())))}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
          >
            Expand all
          </button>
          <button
            type="button"
            onClick={() => setExpanded(new Set())}
            className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold text-slate-600 hover:border-indigo-300 hover:text-indigo-700"
          >
            Collapse all
          </button>
        </div>
      </section>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-16 text-center text-sm text-slate-400">
          No reports match “{search}”.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((category) => {
            const open = isOpen(category.name);
            const Icon = CATEGORY_ICONS[category.name.toLowerCase()] ?? (open ? FolderOpen : FolderClosed);

            return (
              <section
                key={category.name}
                className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition ${
                  open ? 'border-indigo-200' : 'border-slate-200'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggle(category.name)}
                  aria-expanded={open}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-slate-50"
                >
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${
                      open ? 'bg-indigo-600 text-white ring-indigo-600' : 'bg-indigo-50 text-indigo-600 ring-indigo-100'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-slate-900">{category.name}</span>
                    <span className="block text-xs text-slate-500">
                      {category.reports.length} {category.reports.length === 1 ? 'report' : 'reports'}
                    </span>
                  </span>
                  <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>

                {open && (
                  <div className="grid gap-2 border-t border-slate-100 bg-slate-50/60 p-3 sm:grid-cols-2 xl:grid-cols-3">
                    {category.reports.map((report) => (
                      <Link
                        key={report.id}
                        href={report.href}
                        className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 transition hover:border-indigo-300 hover:shadow-sm"
                      >
                        <span className="mt-0.5 text-slate-400 group-hover:text-indigo-600">
                          <FileText className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold text-slate-800 group-hover:text-indigo-700">{report.name}</span>
                          {report.description && (
                            <span className="mt-0.5 block text-xs leading-5 text-slate-500">{report.description}</span>
                          )}
                        </span>
                        <ChevronRight className="mt-0.5 h-4 w-4 text-slate-300 group-hover:text-indigo-500" />
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
