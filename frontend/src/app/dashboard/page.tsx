'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  BadgeDollarSign,
  CalendarDays,
  Package,
  Plus,
  ScrollText,
  ShoppingCart,
  Truck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { type StockItem } from '@/lib/inventory';
import { type OverviewReport, monthStart, reportToday } from '@/lib/reports';
import { financeMoney } from '@/lib/finance';

export default function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(reportToday());
  const [overview, setOverview] = useState<OverviewReport | null>(null);
  const [stockValue, setStockValue] = useState(0);

  useEffect(() => {
    if (!user) return;

    async function fetchStats() {
      const { api } = await import('@/lib/api');
      const stockRequest = hasPermission('items', 'can_read')
        ? api.getAll<StockItem>('/v1/stock')
        : null;
      const reportRequest = hasPermission('reports', 'can_read')
        ? api.get<OverviewReport>(`/v1/reports/overview?from=${from}&to=${to}`)
        : null;

      const [stockResult, reportResult] = await Promise.allSettled([
        stockRequest,
        reportRequest,
      ]);

      if (stockResult.status === 'fulfilled' && stockResult.value?.data) {
        setStockValue(
          stockResult.value.data.reduce((sum, item) => sum + item.stock_value, 0)
        );
      } else {
        setStockValue(0);
      }

      if (reportResult.status === 'fulfilled' && reportResult.value?.data) {
        setOverview(reportResult.value.data);
      } else {
        setOverview(null);
      }
    }

    fetchStats();
  }, [from, hasPermission, to, user]);

  const quickActions = [
    {
      href: '/dashboard/customers',
      label: 'Manage customers',
      description: 'Profiles and contact details',
      icon: UsersRound,
      allowed: hasPermission('customers', 'can_read'),
    },
    {
      href: '/dashboard/items',
      label: 'Manage items',
      description: 'Products, pricing and stock',
      icon: Package,
      allowed: hasPermission('items', 'can_read'),
    },
    {
      href: '/dashboard/hire-purchase',
      label: 'New HP agreement',
      description: 'Create a hire purchase contract',
      icon: ScrollText,
      allowed: hasPermission('hire-purchase', 'can_create'),
    },
    {
      href: '/dashboard/sales',
      label: 'New cash sale',
      description: 'Create a sales invoice',
      icon: ShoppingCart,
      allowed: hasPermission('sales', 'can_create'),
    },
  ].filter((action) => action.allowed);

  return (
    <div className="space-y-8">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-200">
              {user?.role?.name}
            </span>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200">
              Branch {user?.BC}
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">
            Welcome back, {user?.username}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Here is the current stock and finance pulse for this branch.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          {hasPermission('reports', 'can_read') && <>
            <label className="text-xs font-semibold text-slate-500">From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 block rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700" /></label>
            <label className="text-xs font-semibold text-slate-500">To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 block rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700" /></label>
          </>}
          {hasPermission('sales', 'can_create') && (
            <Link href="/dashboard/sales" className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700">
              <Plus className="h-4 w-4" /> New transaction
            </Link>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <FinanceCard label="Stock value" value={financeMoney(stockValue)} icon={Package} tone="violet" />
        <FinanceCard label="Customer receivables" value={financeMoney(overview?.customer_receivables ?? 0)} icon={UsersRound} tone="blue" />
        <FinanceCard label="Supplier payables" value={financeMoney(overview?.supplier_payables ?? 0)} icon={Truck} tone="amber" />
        <FinanceCard label="HP outstanding" value={financeMoney(overview?.active_hp_outstanding ?? 0)} icon={ScrollText} tone="emerald" />
      </section>

      {overview && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <FinanceCard label="Period sales" value={financeMoney(overview.sales)} icon={ShoppingCart} tone="blue" />
          <FinanceCard label="Purchases" value={financeMoney(overview.purchases)} icon={Truck} tone="amber" />
          <FinanceCard label="Collections" value={financeMoney(overview.customer_collections)} icon={BadgeDollarSign} tone="emerald" />
          <FinanceCard label="Net cash flow" value={financeMoney(overview.net_cash_flow)} icon={CalendarDays} tone={overview.net_cash_flow >= 0 ? 'emerald' : 'amber'} />
        </section>
      )}

      {quickActions.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5">
            <h2 className="text-lg font-bold text-slate-900">Quick actions</h2>
            <p className="mt-1 text-sm text-slate-500">
              Common tasks available for your role.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {quickActions.map((action) => (
              <QuickActionButton key={action.href} {...action} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function FinanceCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: keyof typeof TONES;
}) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-2 text-xl font-bold text-slate-950">{value}</p>
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ring-inset ${TONES[tone].icon}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </article>
  );
}

const TONES = {
  blue: {
    icon: 'bg-blue-50 text-blue-600 ring-blue-100',
  },
  emerald: {
    icon: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
  },
  amber: {
    icon: 'bg-amber-50 text-amber-600 ring-amber-100',
  },
  violet: {
    icon: 'bg-violet-50 text-violet-600 ring-violet-100',
  },
};

function QuickActionButton({
  href,
  label,
  description,
  icon: Icon,
}: {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 transition hover:border-indigo-200 hover:bg-indigo-50/60"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 transition group-hover:text-indigo-600 group-hover:ring-indigo-200">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-slate-900">
          {label}
        </span>
        <span className="mt-0.5 block truncate text-xs text-slate-500">
          {description}
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-indigo-600" />
    </Link>
  );
}
