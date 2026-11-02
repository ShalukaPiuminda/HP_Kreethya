'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { StockItem } from '@/lib/inventory';

interface ReorderAlert extends StockItem {
  current_stock: number;
  deficit: number;
}

export default function ReorderAlertsPage() {
  const [alerts, setAlerts] = useState<ReorderAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.getAll<ReorderAlert>('/v1/stock/reorder-alerts');
      setAlerts(response.data ?? []);
    } catch (requestError) {
      setError(getErrorMessage(requestError, 'Unable to load reorder alerts.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadAlerts, 0);
    return () => window.clearTimeout(timer);
  }, [loadAlerts]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return alerts;
    return alerts.filter((item) =>
      item.item_code.toLowerCase().includes(term)
      || item.item_description.toLowerCase().includes(term)
    );
  }, [alerts, search]);

  const totalDeficit = alerts.reduce((sum, item) => sum + item.deficit, 0);
  const emptyStock = alerts.filter((item) => item.current_stock <= 0).length;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">Inventory Control</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Reorder Alerts</h1>
          <p className="mt-1 text-sm text-slate-500">
            Items at or below their configured reorder threshold.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadAlerts}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-amber-300 hover:text-amber-700"
          >
            Refresh
          </button>
          <Link
            href="/dashboard/stock"
            className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-700"
          >
            Receive Stock
          </Link>
        </div>
      </header>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        <SummaryCard label="Alerted Items" value={alerts.length} />
        <SummaryCard label="Total Unit Deficit" value={totalDeficit} />
        <SummaryCard label="Out of Stock" value={emptyStock} danger={emptyStock > 0} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 p-4">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search alerts"
            className="w-full max-w-md rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3.5">Item</th>
                <th className="px-5 py-3.5">Store Availability</th>
                <th className="px-5 py-3.5 text-right">Current</th>
                <th className="px-5 py-3.5 text-right">Reorder</th>
                <th className="px-5 py-3.5 text-right">Deficit</th>
                <th className="px-5 py-3.5">Priority</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-slate-400">Loading reorder alerts...</td></tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <div className="font-semibold text-emerald-700">No reorder alerts</div>
                    <div className="mt-1 text-sm text-slate-400">All configured items are above their thresholds.</div>
                  </td>
                </tr>
              ) : filtered.map((item) => (
                <tr key={item.item_code} className="hover:bg-amber-50/40">
                  <td className="px-5 py-4">
                    <div className="font-mono text-xs font-bold text-amber-700">{item.item_code}</div>
                    <div className="mt-1 font-semibold text-slate-800">{item.item_description}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {item.is_batch ? `${item.batches.length} active batch records` : 'Standard priced item'}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    {item.stores.length === 0 ? (
                      <span className="text-rose-600">No store stock</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {item.stores.map((store) => (
                          <span key={store.store_id} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
                            {store.store_name}: {store.qty_in_hand}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right text-lg font-bold text-slate-900">{item.current_stock}</td>
                  <td className="px-5 py-4 text-right font-semibold text-slate-600">{item.reorder_level}</td>
                  <td className="px-5 py-4 text-right text-lg font-bold text-rose-600">{item.deficit}</td>
                  <td className="px-5 py-4">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      item.current_stock <= 0
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {item.current_stock <= 0 ? 'Critical' : 'Reorder'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, danger = false }: { label: string; value: number; danger?: boolean }) {
  return (
    <div className={`rounded-2xl border p-5 shadow-sm ${danger ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-2 text-3xl font-bold ${danger ? 'text-rose-700' : 'text-amber-700'}`}>{value}</div>
    </div>
  );
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String(error.message);
  }
  return fallback;
}
