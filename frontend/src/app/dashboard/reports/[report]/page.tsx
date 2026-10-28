'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CalendarCheck2, ChartNoAxesCombined, Eye, Filter, PackageSearch } from 'lucide-react';
import { ReportTable, type ReportColumn } from '@/components/report-table';
import { ReportBreadcrumb } from '@/components/report-breadcrumb';
import {
  LoadingTableRow,
  OperationActions,
  OperationField,
  OperationHeader,
  OperationMetric,
  OperationModal,
  OperationNotice,
  StatusPill,
} from '@/components/operation-ui';
import { api, getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { financeDate, financeMoney } from '@/lib/finance';
import type {
  BinCardReport,
  CashFlowReport,
  DayEndPreview,
  DayEndRecord,
  HirePurchaseDetailRow,
  HirePurchaseSummaryRow,
  OverviewReport,
  PurchaseDetailRow,
  PurchaseSummaryRow,
  ReportOptions,
  ReportPoint,
  SalesDetailRow,
  SalesSummaryRow,
  StockInHandReport,
  TransactionReport,
  TransactionReportMode,
  TrialBalance,
} from '@/lib/reports';
import { monthStart, reportToday } from '@/lib/reports';
import { builtInReport, type BuiltInReportKey } from '@/lib/report-catalog';
import type {
  WarrantyClaimsByItemRow,
  WarrantyLineRow,
  WarrantyReport,
  WarrantyReportView,
} from '@/lib/warranty';
import { SearchSelect } from '@/components/search-select';

type Tab = BuiltInReportKey;

type ReportFilters = {
  from: string;
  to: string;
  search: string;
  item_code: string;
  store_id: string;
  supplier_code: string;
  customer_code: string;
  account_code: string;
  status: string;
  mode: TransactionReportMode;
  warranty_view: WarrantyReportView;
  warranty_days: string;
};

const defaultFilters = (): ReportFilters => ({
  from: monthStart(),
  to: reportToday(),
  search: '',
  item_code: '',
  store_id: '',
  supplier_code: '',
  customer_code: '',
  account_code: '1001',
  status: '',
  mode: 'summary',
  warranty_view: 'expiring',
  warranty_days: '30',
});

export default function BuiltInReportPage() {
  const { hasPermission } = useAuth();
  const params = useParams<{ report: string }>();
  const meta = builtInReport(params.report);
  const tab: Tab = meta?.key ?? 'overview';
  const [filters, setFilters] = useState<ReportFilters>(defaultFilters);
  const [options, setOptions] = useState<ReportOptions | null>(null);

  const [overview, setOverview] = useState<OverviewReport | null>(null);
  const [trial, setTrial] = useState<TrialBalance | null>(null);
  const [dayEnds, setDayEnds] = useState<DayEndRecord[]>([]);
  const [stockReport, setStockReport] = useState<StockInHandReport | null>(null);
  const [binCardReport, setBinCardReport] = useState<BinCardReport | null>(null);
  const [purchaseReport, setPurchaseReport] = useState<TransactionReport<PurchaseSummaryRow, PurchaseDetailRow> | null>(null);
  const [salesReport, setSalesReport] = useState<TransactionReport<SalesSummaryRow, SalesDetailRow> | null>(null);
  const [hirePurchaseReport, setHirePurchaseReport] = useState<TransactionReport<HirePurchaseSummaryRow, HirePurchaseDetailRow> | null>(null);
  const [cashFlowReport, setCashFlowReport] = useState<CashFlowReport | null>(null);
  const [warrantyReport, setWarrantyReport] = useState<WarrantyReport | null>(null);

  const [closeOpen, setCloseOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadOptions = useCallback(async () => {
    try {
      const response = await api.get<ReportOptions>('/v1/reports/options');
      const nextOptions = response.data || null;
      setOptions(nextOptions);
      setFilters((current) => ({
        ...current,
        account_code:
          current.account_code ||
          nextOptions?.cash_accounts[0]?.code ||
          '1001',
      }));
    } catch (error) {
      setNotice({ type: 'error', text: getApiErrorMessage(error) });
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === 'overview' || tab === 'trial' || tab === 'day-end') {
        const [overviewResponse, trialResponse, dayEndResponse] = await Promise.all([
          api.get<OverviewReport>(`/v1/reports/overview?from=${filters.from}&to=${filters.to}`),
          api.get<TrialBalance>(`/v1/reports/trial-balance?to=${filters.to}`),
          api.getAll<DayEndRecord>('/v1/reports/day-ends'),
        ]);
        setOverview(overviewResponse.data || null);
        setTrial(trialResponse.data || null);
        setDayEnds(dayEndResponse.data || []);
      } else if (tab === 'stock-in-hand') {
        const params = buildQuery({
          search: filters.search,
          item_code: filters.item_code,
          store_id: filters.store_id,
        });
        const response = await api.get<StockInHandReport>(`/v1/reports/stock-in-hand?${params}`);
        setStockReport(response.data || null);
      } else if (tab === 'bin-card') {
        if (!filters.item_code) {
          setBinCardReport(null);
          return;
        }
        const params = buildQuery({
          item_code: filters.item_code,
          store_id: filters.store_id,
          from: filters.from,
          to: filters.to,
        });
        const response = await api.get<BinCardReport>(`/v1/reports/bin-card?${params}`);
        setBinCardReport(response.data || null);
      } else if (tab === 'grn') {
        const params = buildQuery({
          mode: filters.mode,
          from: filters.from,
          to: filters.to,
          search: filters.search,
          supplier_code: filters.supplier_code,
          item_code: filters.item_code,
          store_id: filters.store_id,
        });
        const response = await api.get<TransactionReport<PurchaseSummaryRow, PurchaseDetailRow>>(`/v1/reports/purchases?${params}`);
        setPurchaseReport(response.data || null);
      } else if (tab === 'sales') {
        const params = buildQuery({
          mode: filters.mode,
          from: filters.from,
          to: filters.to,
          search: filters.search,
          customer_code: filters.customer_code,
          item_code: filters.item_code,
          store_id: filters.store_id,
        });
        const response = await api.get<TransactionReport<SalesSummaryRow, SalesDetailRow>>(`/v1/reports/sales?${params}`);
        setSalesReport(response.data || null);
      } else if (tab === 'hire-purchase') {
        const params = buildQuery({
          mode: filters.mode,
          from: filters.from,
          to: filters.to,
          search: filters.search,
          customer_code: filters.customer_code,
          item_code: filters.item_code,
          store_id: filters.store_id,
          status: filters.status,
        });
        const response = await api.get<TransactionReport<HirePurchaseSummaryRow, HirePurchaseDetailRow>>(`/v1/reports/hire-purchase?${params}`);
        setHirePurchaseReport(response.data || null);
      } else if (tab === 'warranty') {
        const view = filters.warranty_view;
        const params = buildQuery({
          view,
          days: view === 'expiring' ? filters.warranty_days : '',
          from: view === 'expiring' ? '' : filters.from,
          to: view === 'expiring' ? '' : filters.to,
          search: view === 'claims_by_item' ? '' : filters.search,
          customer_code: view === 'claims_by_item' ? '' : filters.customer_code,
          item_code: filters.item_code,
          store_id: filters.store_id,
        });
        const response = await api.get<WarrantyReport>(`/v1/reports/warranty?${params}`);
        setWarrantyReport(response.data || null);
      } else if (tab === 'cash-in-out') {
        const params = buildQuery({
          from: filters.from,
          to: filters.to,
          account_code: filters.account_code,
        });
        const response = await api.get<CashFlowReport>(`/v1/reports/cash-flow?${params}`);
        setCashFlowReport(response.data || null);
      }
    } catch (error) {
      setNotice({ type: 'error', text: getApiErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [filters, tab]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 150);

    return () => window.clearTimeout(timer);
  }, [load]);

  if (!meta) {
    return (
      <div className="space-y-6">
        <ReportBreadcrumb />
        <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-slate-500">
          This report does not exist.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ReportBreadcrumb category={meta.category} name={meta.name} />

      <OperationHeader
        eyebrow={meta.category ?? 'Business Intelligence'}
        title={meta.name}
        description={meta.description}
        icon={ChartNoAxesCombined}
        actions={
          hasPermission('reports', 'can_create') ? (
            <button
              onClick={() => setCloseOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white"
            >
              <CalendarCheck2 className="h-4 w-4" />
              Close business day
            </button>
          ) : null
        }
      />

      {notice && <OperationNotice type={notice.type}>{notice.text}</OperationNotice>}

      <ReportFiltersPanel
        tab={tab}
        filters={filters}
        options={options}
        onChange={setFilters}
      />

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-slate-400">
          Loading report data...
        </div>
      ) : (
        renderTab({
          tab,
          overview,
          trial,
          dayEnds,
          stockReport,
          binCardReport,
          purchaseReport,
          salesReport,
          hirePurchaseReport,
          cashFlowReport,
          warrantyReport,
        })
      )}

      {closeOpen && (
        <DayEndModal
          onClose={() => setCloseOpen(false)}
          onSaved={() => {
            setCloseOpen(false);
            setNotice({ type: 'success', text: 'Business day closed.' });
            void load();
          }}
        />
      )}
    </div>
  );
}

function ReportFiltersPanel({
  tab,
  filters,
  options,
  onChange,
}: {
  tab: Tab;
  filters: ReportFilters;
  options: ReportOptions | null;
  onChange: React.Dispatch<React.SetStateAction<ReportFilters>>;
}) {
  const warrantyExpiring = tab === 'warranty' && filters.warranty_view === 'expiring';
  const warrantyByItem = tab === 'warranty' && filters.warranty_view === 'claims_by_item';
  const showDateRange = !['trial', 'day-end'].includes(tab) && !warrantyExpiring;
  const showSearch = ['stock-in-hand', 'grn', 'sales', 'hire-purchase', 'warranty'].includes(tab) && !warrantyByItem;
  const showItem = ['stock-in-hand', 'bin-card', 'grn', 'sales', 'hire-purchase', 'warranty'].includes(tab);
  const showStore = ['stock-in-hand', 'bin-card', 'grn', 'sales', 'hire-purchase', 'warranty'].includes(tab);
  const showSupplier = tab === 'grn';
  const showCustomer = ['sales', 'hire-purchase', 'warranty'].includes(tab) && !warrantyByItem;
  const showMode = ['grn', 'sales', 'hire-purchase'].includes(tab);
  const showStatus = tab === 'hire-purchase';
  const showAccount = tab === 'cash-in-out';
  const showMonthReset = showDateRange || tab === 'trial';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Filter className="h-4 w-4 text-indigo-600" />
          Customize report
        </div>
        {showMonthReset && (
          <button
            type="button"
            onClick={() =>
              onChange((current) => ({
                ...current,
                from: monthStart(),
                to: reportToday(),
              }))
            }
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
          >
            Reset to current month
          </button>
        )}
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {tab === 'warranty' && (
          <OperationField label="Report view">
            <select
              value={filters.warranty_view}
              onChange={(event) =>
                onChange((current) => ({ ...current, warranty_view: event.target.value as WarrantyReportView }))
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
            >
              <option value="expiring">Expiring soon</option>
              <option value="claims_by_item">Claims by item</option>
              <option value="register">Warranty register</option>
            </select>
          </OperationField>
        )}

        {warrantyExpiring && (
          <OperationField label="Expiring within">
            <select
              value={filters.warranty_days}
              onChange={(event) => onChange((current) => ({ ...current, warranty_days: event.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
            >
              {['7', '30', '60', '90'].map((days) => (
                <option key={days} value={days}>{days} days</option>
              ))}
            </select>
          </OperationField>
        )}

        {showDateRange && (
          <>
            <OperationField label="From">
              <input
                type="date"
                value={filters.from}
                onChange={(event) => onChange((current) => ({ ...current, from: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
              />
            </OperationField>
            <OperationField label="To">
              <input
                type="date"
                value={filters.to}
                onChange={(event) => onChange((current) => ({ ...current, to: event.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
              />
            </OperationField>
          </>
        )}

        {tab === 'trial' && (
          <OperationField label="As of">
            <input
              type="date"
              value={filters.to}
              onChange={(event) => onChange((current) => ({ ...current, to: event.target.value }))}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
            />
          </OperationField>
        )}

        {showSearch && (
          <OperationField label="Search">
            <input
              value={filters.search}
              onChange={(event) => onChange((current) => ({ ...current, search: event.target.value }))}
              placeholder="Reference, name, item..."
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
            />
          </OperationField>
        )}

        {showItem && (
          <OperationField label={tab === 'bin-card' ? 'Item (required)' : 'Item'}>
            <SearchSelect
              value={filters.item_code}
              onChange={(value) => onChange((current) => ({ ...current, item_code: value }))}
              options={(options?.items ?? []).map((item) => ({ value: item.item_code, label: `${item.item_code} - ${item.item_description}` }))}
              placeholder="Select an item"
              emptyOption={tab === 'bin-card' ? undefined : 'All items'}
              searchPlaceholder="Search by code or description..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
            />
          </OperationField>
        )}

        {showStore && (
          <OperationField label="Store">
            <SearchSelect
              value={filters.store_id}
              onChange={(value) => onChange((current) => ({ ...current, store_id: value }))}
              options={(options?.stores ?? []).map((store) => ({ value: String(store.id), label: store.name }))}
              title="Select store"
              emptyOption="All stores"
              searchPlaceholder="Search stores..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
            />
          </OperationField>
        )}

        {showSupplier && (
          <OperationField label="Supplier">
            <SearchSelect
              value={filters.supplier_code}
              onChange={(value) => onChange((current) => ({ ...current, supplier_code: value }))}
              options={(options?.suppliers ?? []).map((supplier) => ({ value: supplier.Code, label: supplier.name, keywords: supplier.Code }))}
              title="Select supplier"
              emptyOption="All suppliers"
              searchPlaceholder="Search suppliers..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
            />
          </OperationField>
        )}

        {showCustomer && (
          <OperationField label="Customer">
            <SearchSelect
              value={filters.customer_code}
              onChange={(value) => onChange((current) => ({ ...current, customer_code: value }))}
              options={(options?.customers ?? []).map((customer) => ({ value: customer.Code, label: customer.name, keywords: customer.Code }))}
              title="Select customer"
              emptyOption="All customers"
              searchPlaceholder="Search customers..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
            />
          </OperationField>
        )}

        {showMode && (
          <OperationField label="View mode">
            <select
              value={filters.mode}
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  mode: event.target.value as TransactionReportMode,
                }))
              }
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
            >
              <option value="summary">Summary</option>
              <option value="detail">Detail</option>
            </select>
          </OperationField>
        )}

        {showStatus && (
          <OperationField label="Agreement status">
            <select
              value={filters.status}
              onChange={(event) => onChange((current) => ({ ...current, status: event.target.value }))}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="converted">Converted</option>
              <option value="returned">Returned</option>
            </select>
          </OperationField>
        )}

        {showAccount && (
          <OperationField label="Cash / bank account">
            <SearchSelect
              value={filters.account_code}
              onChange={(value) => onChange((current) => ({ ...current, account_code: value }))}
              options={(options?.cash_accounts ?? []).map((account) => ({ value: account.code, label: `${account.code} - ${account.description}` }))}
              placeholder="Select account"
              searchPlaceholder="Search accounts..."
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5"
            />
          </OperationField>
        )}
      </div>
    </section>
  );
}

function renderTab({
  tab,
  overview,
  trial,
  dayEnds,
  stockReport,
  binCardReport,
  purchaseReport,
  salesReport,
  hirePurchaseReport,
  cashFlowReport,
  warrantyReport,
}: {
  tab: Tab;
  overview: OverviewReport | null;
  trial: TrialBalance | null;
  dayEnds: DayEndRecord[];
  stockReport: StockInHandReport | null;
  binCardReport: BinCardReport | null;
  purchaseReport: TransactionReport<PurchaseSummaryRow, PurchaseDetailRow> | null;
  salesReport: TransactionReport<SalesSummaryRow, SalesDetailRow> | null;
  hirePurchaseReport: TransactionReport<HirePurchaseSummaryRow, HirePurchaseDetailRow> | null;
  cashFlowReport: CashFlowReport | null;
  warrantyReport: WarrantyReport | null;
}) {
  if (tab === 'overview') return <Overview report={overview} />;
  if (tab === 'trial') return <TrialBalanceView report={trial} />;
  if (tab === 'day-end') return <DayEndView rows={dayEnds} />;
  if (tab === 'stock-in-hand') return <StockInHandView report={stockReport} />;
  if (tab === 'bin-card') return <BinCardView report={binCardReport} />;
  if (tab === 'grn') return <PurchasesView report={purchaseReport} />;
  if (tab === 'sales') return <SalesView report={salesReport} />;
  if (tab === 'hire-purchase') return <HirePurchaseView report={hirePurchaseReport} />;
  if (tab === 'warranty') return <WarrantyView report={warrantyReport} />;
  return <CashFlowView report={cashFlowReport} />;
}

function Overview({ report }: { report: OverviewReport | null }) {
  if (!report) return null;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OperationMetric label="Sales" value={financeMoney(report.sales)} tone="indigo" />
        <OperationMetric label="Customer collections" value={financeMoney(report.customer_collections)} tone="emerald" />
        <OperationMetric label="Expenses" value={financeMoney(report.expenses)} tone="rose" />
        <OperationMetric label="Net cash flow" value={financeMoney(report.net_cash_flow)} tone={report.net_cash_flow >= 0 ? 'emerald' : 'rose'} />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OperationMetric label="HP outstanding" value={financeMoney(report.active_hp_outstanding)} tone="amber" />
        <OperationMetric label="Customer receivables" value={financeMoney(report.customer_receivables)} />
        <OperationMetric label="Supplier payables" value={financeMoney(report.supplier_payables)} />
        <OperationMetric label="Assets less liabilities" value={financeMoney(report.assets - report.liabilities)} tone="indigo" />
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <SeriesCard title="Daily sales" data={report.daily_sales} tone="bg-indigo-500" />
        <SeriesCard title="Daily collections" data={report.daily_collections} tone="bg-emerald-500" />
      </div>
    </div>
  );
}

function SeriesCard({ title, data, tone }: { title: string; data: ReportPoint[]; tone: string }) {
  const max = Math.max(1, ...data.map((point) => point.total));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="font-bold text-slate-900">{title}</h3>
      <div className="mt-5 flex min-h-56 items-end gap-2 overflow-x-auto">
        {data.length === 0 ? (
          <div className="m-auto text-sm text-slate-400">No activity in this period.</div>
        ) : (
          data.map((point) => (
            <div key={point.date} className="flex min-w-12 flex-1 flex-col items-center gap-2">
              <div
                title={financeMoney(point.total)}
                className={`w-full min-w-8 rounded-t-lg ${tone}`}
                style={{ height: `${Math.max(8, (point.total / max) * 170)}px` }}
              />
              <span className="text-[10px] text-slate-500">{point.date.slice(5)}</span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function TrialBalanceView({ report }: { report: TrialBalance | null }) {
  if (!report) return null;

  return (
    <div className="space-y-4">
      <section className="grid gap-4 sm:grid-cols-3">
        <OperationMetric label="Total debits" value={financeMoney(report.debit_total)} />
        <OperationMetric label="Total credits" value={financeMoney(report.credit_total)} />
        <OperationMetric label="Difference" value={financeMoney(report.difference)} tone={report.difference ? 'rose' : 'emerald'} />
      </section>

      <ReportTable
        title="Trial balance"
        subtitle={`Balances as of ${financeDate(report.as_of)}`}
        rows={report.accounts}
        emptyLabel="No accounts found."
        exportName="trial-balance"
        initialSortKey="code"
        columns={[
          {
            key: 'code',
            label: 'Account',
            sortable: true,
            sortValue: (row) => row.code,
            exportValue: (row) => `${row.code} ${row.description}`,
            render: (row) => (
              <div>
                <div className="font-mono font-semibold text-indigo-700">{row.code}</div>
                <div className="text-slate-600">{row.description}</div>
              </div>
            ),
          },
          {
            key: 'type',
            label: 'Classification',
            sortable: true,
            sortValue: (row) => `${row.category} ${row.type}`,
            exportValue: (row) => `${row.category} / ${row.type}`,
            render: (row) => (
              <div>
                <div>{row.type}</div>
                <div className="text-xs text-slate-500">{row.category}</div>
              </div>
            ),
          },
          moneyColumn('debit', 'Debit'),
          moneyColumn('credit', 'Credit'),
          moneyColumn('debit_balance', 'Debit Balance'),
          moneyColumn('credit_balance', 'Credit Balance'),
        ]}
      />
    </div>
  );
}

function DayEndView({ rows }: { rows: DayEndRecord[] }) {
  return (
    <ReportTable
      title="Closed business days"
      subtitle="Daily cash closure history with variance tracking."
      rows={rows}
      emptyLabel="No business days closed yet."
      exportName="day-end-history"
      initialSortKey="close_date"
      initialSortDirection="desc"
      columns={[
        {
          key: 'close_date',
          label: 'Business Day',
          sortable: true,
          sortValue: (row) => row.close_date,
          exportValue: (row) => row.close_date,
          render: (row) => <span className="font-semibold">{financeDate(row.close_date)}</span>,
        },
        moneyColumn('opening_balance', 'Opening'),
        moneyColumn('closing_balance', 'Expected Close'),
        moneyColumn('counted_cash', 'Counted Cash'),
        {
          key: 'variance',
          label: 'Variance',
          sortable: true,
          align: 'right',
          sortValue: (row) => Number(row.variance),
          exportValue: (row) => Number(row.variance),
          render: (row) => (
            <span className={Number(row.variance) ? 'font-semibold text-rose-700' : 'font-semibold text-emerald-700'}>
              {financeMoney(row.variance)}
            </span>
          ),
        },
        {
          key: 'closed_by',
          label: 'Closed By',
          sortable: true,
          sortValue: (row) => row.closed_by?.username || '',
          exportValue: (row) => row.closed_by?.username || '',
          render: (row) => row.closed_by?.username || '—',
        },
      ]}
    />
  );
}

function StockInHandView({ report }: { report: StockInHandReport | null }) {
  if (!report) return null;

  const columns: ReportColumn<StockInHandReport['rows'][number]>[] = [
    {
      key: 'item_code',
      label: 'Item',
      sortable: true,
      sortValue: (row) => row.item_code,
      exportValue: (row) => `${row.item_code} ${row.item_description}`,
      render: (row) => (
        <div>
          <div className="font-mono font-semibold text-indigo-700">{row.item_code}</div>
          <div className="text-slate-700">{row.item_description}</div>
        </div>
      ),
    },
    {
      key: 'tracking',
      label: 'Tracking',
      sortable: true,
      sortValue: (row) => `${row.is_batch ? 'batch' : ''}${row.is_serialized ? 'serial' : ''}`,
      exportValue: (row) =>
        [
          row.is_batch ? `Batch (${row.default_batch_price_mode || 'batch'})` : null,
          row.is_serialized ? 'Serial' : null,
        ]
          .filter(Boolean)
          .join(', '),
      render: (row) => (
        <div className="flex flex-wrap gap-1.5">
          {row.is_batch && <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700">Batch · {row.default_batch_price_mode || 'batch'}</span>}
          {row.is_serialized && <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">Serial</span>}
          {!row.is_batch && !row.is_serialized && <span className="text-slate-400">Standard</span>}
        </div>
      ),
    },
    {
      key: 'total_qty',
      label: 'Qty',
      sortable: true,
      align: 'right',
      sortValue: (row) => row.total_qty,
      exportValue: (row) => row.total_qty,
      render: (row) => <span className="font-semibold">{row.total_qty}</span>,
    },
    moneyColumn('average_cost', 'Avg Cost'),
    moneyColumn('stock_value', 'Stock Value'),
    {
      key: 'batches',
      label: 'Batches / Stores',
      sortable: false,
      exportValue: (row) =>
        row.is_batch
          ? row.batches.map((batch) => `${batch.batch_no} @ ${batch.store_name} (${batch.qty_in_hand})`).join(' | ')
          : row.stores.map((store) => `${store.store_name} (${store.qty_in_hand})`).join(' | '),
      render: (row) => (
        <CellList
          items={
            row.is_batch
              ? row.batches.map((batch) => `${batch.batch_no} · ${batch.store_name} · ${batch.qty_in_hand}`)
              : row.stores.map((store) => `${store.store_name} · ${store.qty_in_hand}`)
          }
        />
      ),
    },
    {
      key: 'serial_numbers',
      label: 'Serials',
      sortable: true,
      sortValue: (row) => row.serial_count,
      exportValue: (row) => row.serial_numbers.join(' | '),
      render: (row) => (
        row.serial_numbers.length > 0 ? (
          <CellList items={row.serial_numbers} />
        ) : (
          <span className="text-slate-400">—</span>
        )
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OperationMetric label="Items in hand" value={String(report.summary.items)} tone="indigo" />
        <OperationMetric label="Units available" value={String(report.summary.units)} />
        <OperationMetric label="Stock value" value={financeMoney(report.summary.stock_value)} tone="emerald" />
        <OperationMetric label="Serialized items" value={String(report.summary.serialized_items)} tone="amber" />
      </section>

      <ReportTable
        title="Stock in hand"
        subtitle="Current stock position with batch pricing and live serial availability."
        rows={report.rows}
        columns={columns}
        emptyLabel="No stock is currently in hand for the selected filters."
        exportName="stock-in-hand"
        initialSortKey="item_code"
      />
    </div>
  );
}

function BinCardView({ report }: { report: BinCardReport | null }) {
  if (!report) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center text-slate-400">
        Select an item to generate a full movement history.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OperationMetric label="Opening balance" value={String(report.summary.opening_balance)} />
        <OperationMetric label="Total in" value={String(report.summary.total_in)} tone="emerald" />
        <OperationMetric label="Total out" value={String(report.summary.total_out)} tone="rose" />
        <OperationMetric label="Closing balance" value={String(report.summary.closing_balance)} tone="indigo" />
      </section>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            <PackageSearch className="h-5 w-5" />
          </span>
          <div>
            <h3 className="font-bold text-slate-900">{report.item.item_code}</h3>
            <p className="text-sm text-slate-500">{report.item.item_description}</p>
          </div>
        </div>
      </div>

      <ReportTable
        title="Bin card"
        subtitle="Movement-by-movement stock trace with batch and serial details."
        rows={report.rows}
        emptyLabel="No item movements found for the selected filters."
        exportName={`bin-card-${report.item.item_code}`}
        initialSortKey="date"
        columns={[
          {
            key: 'date',
            label: 'Date',
            sortable: true,
            sortValue: (row) => row.date,
            exportValue: (row) => row.date,
            render: (row) => financeDate(row.date),
          },
          {
            key: 'movement_type',
            label: 'Type',
            sortable: true,
            sortValue: (row) => row.movement_type,
            exportValue: (row) => row.movement_type,
            render: (row) => (
              <div>
                <div className="font-semibold text-slate-800">{row.movement_type}</div>
                <div className="text-xs text-slate-500">{row.trans_code}</div>
              </div>
            ),
          },
          {
            key: 'trans_no',
            label: 'Reference',
            sortable: true,
            sortValue: (row) => row.trans_no,
            exportValue: (row) => row.trans_no,
            render: (row) => <span className="font-mono">{row.trans_no}</span>,
          },
          {
            key: 'store_name',
            label: 'Store / Batch',
            sortable: true,
            sortValue: (row) => `${row.store_name}${row.batch_no || ''}`,
            exportValue: (row) => `${row.store_name}${row.batch_no ? ` / ${row.batch_no}` : ''}`,
            render: (row) => (
              <div>
                <div>{row.store_name}</div>
                <div className="text-xs text-slate-500">{row.batch_no || '—'}</div>
              </div>
            ),
          },
          {
            key: 'qty_in',
            label: 'Qty In',
            sortable: true,
            align: 'right',
            sortValue: (row) => row.qty_in,
            exportValue: (row) => row.qty_in,
            render: (row) => <span className="font-semibold text-emerald-700">{row.qty_in || '—'}</span>,
          },
          {
            key: 'qty_out',
            label: 'Qty Out',
            sortable: true,
            align: 'right',
            sortValue: (row) => row.qty_out,
            exportValue: (row) => row.qty_out,
            render: (row) => <span className="font-semibold text-rose-700">{row.qty_out || '—'}</span>,
          },
          {
            key: 'running_balance',
            label: 'Balance',
            sortable: true,
            align: 'right',
            sortValue: (row) => row.running_balance,
            exportValue: (row) => row.running_balance,
            render: (row) => <span className="font-bold">{row.running_balance}</span>,
          },
          {
            key: 'serial_numbers',
            label: 'Serials',
            sortable: true,
            sortValue: (row) => row.serial_count,
            exportValue: (row) => row.serial_numbers.join(' | '),
            render: (row) => (
              row.serial_numbers.length ? <CellList items={row.serial_numbers} /> : <span className="text-slate-400">—</span>
            ),
          },
        ]}
      />
    </div>
  );
}

function PurchasesView({ report }: { report: TransactionReport<PurchaseSummaryRow, PurchaseDetailRow> | null }) {
  if (!report) return null;

  const summaryColumns: ReportColumn<PurchaseSummaryRow>[] = [
    textColumn('invoice_no', 'GRN', (row) => row.invoice_no),
    textColumn('supplier_name', 'Supplier', (row) => row.supplier_name),
    textColumn('store_name', 'Store', (row) => row.store_name),
    numberColumn('qty_total', 'Qty', (row) => row.qty_total),
    numberColumn('free_qty_total', 'Free Qty', (row) => row.free_qty_total),
    moneyColumn('net_amount', 'Net Amount'),
    moneyColumn('paid_amount', 'Paid'),
    moneyColumn('balance_amount', 'Balance'),
    {
      key: 'payment_status',
      label: 'Status',
      sortable: true,
      sortValue: (row) => row.payment_status,
      exportValue: (row) => row.payment_status,
      render: (row) => <StatusPill status={row.payment_status} />,
    },
  ];

  const detailColumns: ReportColumn<PurchaseDetailRow>[] = [
    textColumn('invoice_no', 'GRN', (row) => row.invoice_no),
    textColumn('supplier_name', 'Supplier', (row) => row.supplier_name),
    textColumn('item_code', 'Item', (row) => `${row.item_code} ${row.item_description}`),
    textColumn('batch_no', 'Batch', (row) => row.batch_no || '—'),
    numberColumn('qty', 'Qty', (row) => row.qty),
    numberColumn('free_qty', 'Free Qty', (row) => row.free_qty),
    numberColumn('received_qty', 'Received', (row) => row.received_qty),
    moneyColumn('unit_price', 'Unit Price'),
    moneyColumn('sales_price', 'Sales Price'),
    moneyColumn('net_value', 'Net Value'),
    {
      key: 'serial_numbers',
      label: 'Serials',
      sortable: true,
      sortValue: (row) => row.serial_numbers.length,
      exportValue: (row) => row.serial_numbers.join(' | '),
      render: (row) => (row.serial_numbers.length ? <CellList items={row.serial_numbers} /> : <span className="text-slate-400">—</span>),
    },
  ];

  return (
    <div className="space-y-4">
      <section className="grid gap-4 sm:grid-cols-2">
        <OperationMetric label="Rows" value={String(report.summary.rows)} />
        <OperationMetric label="Net total" value={financeMoney(report.summary.net_total)} tone="indigo" />
      </section>
      <ReportTable
        title={`Goods Received Notes · ${report.mode === 'summary' ? 'Summary' : 'Detail'}`}
        subtitle="Supplier receipts with batch, free-issue, and serial visibility."
        rows={report.rows as Array<PurchaseSummaryRow | PurchaseDetailRow>}
        columns={(report.mode === 'summary' ? summaryColumns : detailColumns) as Array<ReportColumn<PurchaseSummaryRow | PurchaseDetailRow>>}
        emptyLabel="No purchase receipts found."
        exportName={`grn-${report.mode}`}
        initialSortKey="invoice_no"
      />
    </div>
  );
}

function SalesView({ report }: { report: TransactionReport<SalesSummaryRow, SalesDetailRow> | null }) {
  if (!report) return null;

  const summaryColumns: ReportColumn<SalesSummaryRow>[] = [
    textColumn('invoice_no', 'Invoice', (row) => row.invoice_no),
    textColumn('customer_name', 'Customer', (row) => `${row.customer_name} · ${row.customer_nic}`),
    textColumn('store_name', 'Store', (row) => row.store_name),
    numberColumn('qty_total', 'Qty', (row) => row.qty_total),
    moneyColumn('net_amount', 'Net'),
    moneyColumn('paid_amount', 'Paid'),
    moneyColumn('credit_amount', 'Credit'),
    moneyColumn('advance_applied', 'Advance'),
    {
      key: 'payment_status',
      label: 'Status',
      sortable: true,
      sortValue: (row) => row.payment_status,
      exportValue: (row) => row.payment_status,
      render: (row) => <StatusPill status={row.payment_status} />,
    },
  ];

  const detailColumns: ReportColumn<SalesDetailRow>[] = [
    textColumn('invoice_no', 'Invoice', (row) => row.invoice_no),
    textColumn('customer_name', 'Customer', (row) => row.customer_name),
    textColumn('item_code', 'Item', (row) => `${row.item_code} ${row.item_description}`),
    textColumn('batch_no', 'Batch', (row) => row.batch_no || '—'),
    numberColumn('qty', 'Qty', (row) => row.qty),
    moneyColumn('unit_price', 'Unit Price'),
    moneyColumn('discount', 'Discount'),
    moneyColumn('net_value', 'Net Value'),
    {
      key: 'serial_numbers',
      label: 'Serials',
      sortable: true,
      sortValue: (row) => row.serial_numbers.length,
      exportValue: (row) => row.serial_numbers.join(' | '),
      render: (row) => (row.serial_numbers.length ? <CellList items={row.serial_numbers} /> : <span className="text-slate-400">—</span>),
    },
  ];

  return (
    <div className="space-y-4">
      <section className="grid gap-4 sm:grid-cols-2">
        <OperationMetric label="Rows" value={String(report.summary.rows)} />
        <OperationMetric label="Net total" value={financeMoney(report.summary.net_total)} tone="indigo" />
      </section>
      <ReportTable
        title={`Sales report · ${report.mode === 'summary' ? 'Summary' : 'Detail'}`}
        subtitle="Sortable sales output with batch pricing, serial traceability, and payment breakdowns."
        rows={report.rows as Array<SalesSummaryRow | SalesDetailRow>}
        columns={(report.mode === 'summary' ? summaryColumns : detailColumns) as Array<ReportColumn<SalesSummaryRow | SalesDetailRow>>}
        emptyLabel="No sales found."
        exportName={`sales-${report.mode}`}
        initialSortKey="invoice_no"
      />
    </div>
  );
}

function HirePurchaseView({ report }: { report: TransactionReport<HirePurchaseSummaryRow, HirePurchaseDetailRow> | null }) {
  if (!report) return null;

  const summaryColumns: ReportColumn<HirePurchaseSummaryRow>[] = [
    textColumn('agreement_no', 'Agreement', (row) => `${row.agreement_no} · ${row.invoice_no}`),
    textColumn('customer_name', 'Customer', (row) => `${row.customer_name} · ${row.customer_nic}`),
    textColumn('schema_type', 'Schema', (row) => row.schema_type),
    textColumn('store_name', 'Store', (row) => row.store_name),
    moneyColumn('net_amount', 'Net'),
    moneyColumn('contract_amount', 'Contract'),
    moneyColumn('down_payment', 'Down Payment'),
    moneyColumn('outstanding_amount', 'Outstanding'),
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      sortValue: (row) => row.status,
      exportValue: (row) => row.status,
      render: (row) => <StatusPill status={row.status} />,
    },
  ];

  const detailColumns: ReportColumn<HirePurchaseDetailRow>[] = [
    textColumn('agreement_no', 'Agreement', (row) => row.agreement_no),
    textColumn('customer_name', 'Customer', (row) => row.customer_name),
    textColumn('item_code', 'Item', (row) => `${row.item_code} ${row.item_description}`),
    textColumn('batch_no', 'Batch', (row) => row.batch_no || '—'),
    numberColumn('qty', 'Qty', (row) => row.qty),
    numberColumn('returned_qty', 'Returned', (row) => row.returned_qty),
    moneyColumn('unit_price', 'Unit Price'),
    moneyColumn('discount', 'Discount'),
    moneyColumn('net_value', 'Net Value'),
    {
      key: 'serial_numbers',
      label: 'Serials',
      sortable: true,
      sortValue: (row) => row.serial_numbers.length,
      exportValue: (row) => row.serial_numbers.join(' | '),
      render: (row) => (row.serial_numbers.length ? <CellList items={row.serial_numbers} /> : <span className="text-slate-400">—</span>),
    },
  ];

  return (
    <div className="space-y-4">
      <section className="grid gap-4 sm:grid-cols-2">
        <OperationMetric label="Rows" value={String(report.summary.rows)} />
        <OperationMetric label="Net total" value={financeMoney(report.summary.net_total)} tone="indigo" />
      </section>
      <ReportTable
        title={`Hire purchase report · ${report.mode === 'summary' ? 'Summary' : 'Detail'}`}
        subtitle="Agreement-level and line-level reporting with status, batch, serial, and outstanding balances."
        rows={report.rows as Array<HirePurchaseSummaryRow | HirePurchaseDetailRow>}
        columns={(report.mode === 'summary' ? summaryColumns : detailColumns) as Array<ReportColumn<HirePurchaseSummaryRow | HirePurchaseDetailRow>>}
        emptyLabel="No hire purchase records found."
        exportName={`hire-purchase-${report.mode}`}
        initialSortKey={report.mode === 'summary' ? 'agreement_no' : 'invoice_no'}
      />
    </div>
  );
}

const WARRANTY_STATUS_TONES: Record<WarrantyLineRow['status'], string> = {
  Active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'With us': 'bg-amber-50 text-amber-700 ring-amber-200',
  Replaced: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  Expired: 'bg-slate-100 text-slate-600 ring-slate-200',
  Returned: 'bg-rose-50 text-rose-700 ring-rose-200',
};

function WarrantyView({ report }: { report: WarrantyReport | null }) {
  if (!report) return null;

  if (report.view === 'claims_by_item') {
    const columns: ReportColumn<WarrantyClaimsByItemRow>[] = [
      textColumn('item_code', 'Item', (row) => `${row.item_code} ${row.item_description ?? ''}`),
      numberColumn('units_sold', 'Warranty Units Sold', (row) => row.units_sold),
      numberColumn('total_claims', 'Claims', (row) => row.total_claims),
      numberColumn('repair', 'Repair', (row) => row.repair),
      numberColumn('replace', 'Replace', (row) => row.replace),
      numberColumn('refund', 'Refund', (row) => row.refund),
      numberColumn('rejected', 'Rejected', (row) => row.rejected),
      numberColumn('open', 'With Us', (row) => row.open),
      numberColumn('repeat_units', 'Repeat Units', (row) => row.repeat_units),
      {
        key: 'claim_rate',
        label: 'Claim Rate',
        sortable: true,
        align: 'right',
        sortValue: (row) => row.claim_rate ?? -1,
        exportValue: (row) => row.claim_rate ?? '',
        render: (row) => (row.claim_rate === null ? <span className="text-slate-400">—</span> : <span className="font-semibold">{row.claim_rate}%</span>),
      },
    ];

    return (
      <div className="space-y-4">
        <section className="grid gap-4 sm:grid-cols-3">
          <OperationMetric label="Claims" value={String(report.summary.total_claims)} tone="indigo" />
          <OperationMetric label="With us now" value={String(report.summary.open)} tone="amber" />
          <OperationMetric label="Rejected" value={String(report.summary.rejected)} tone="rose" />
        </section>
        <ReportTable
          title="Warranty claims by item"
          subtitle="Claims in the period against warranty units sold in the same period. Items with the highest claim count are listed first."
          rows={report.rows}
          columns={columns}
          emptyLabel="No warranty claims in this period."
          exportName="warranty-claims-by-item"
          initialSortKey="total_claims"
          initialSortDirection="desc"
        />
      </div>
    );
  }

  const columns: ReportColumn<WarrantyLineRow>[] = [
    textColumn('warranty_expiry_date', 'Expires', (row) => row.warranty_expiry_date),
    numberColumn('days_left', 'Days Left', (row) => row.days_left),
    textColumn('item_code', 'Item', (row) => `${row.item_code} ${row.item_description ?? ''}`),
    {
      key: 'serial_numbers',
      label: 'Serials',
      sortable: true,
      sortValue: (row) => row.serial_numbers.join(' '),
      exportValue: (row) => [...row.serial_numbers, ...row.replacement_serials.map((serial) => `now ${serial}`)].join(' | '),
      render: (row) => (row.serial_numbers.length
        ? <CellList items={[...row.serial_numbers, ...row.replacement_serials.map((serial) => `→ ${serial}`)]} />
        : <span className="text-slate-500">Qty {row.qty}</span>),
    },
    textColumn('customer_name', 'Customer', (row) => [row.customer_name, row.customer_phone].filter(Boolean).join(' · ') || '—'),
    textColumn('invoice_no', 'Sale', (row) => `${row.source_type === 'hp' ? `HP ${row.agreement_no ?? row.invoice_no}` : row.invoice_no} · ${row.sale_date}`),
    numberColumn('warranty_months', 'Months', (row) => row.warranty_months),
    numberColumn('claims', 'Claims', (row) => row.claims),
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      sortValue: (row) => row.status,
      exportValue: (row) => row.status,
      render: (row) => (
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${WARRANTY_STATUS_TONES[row.status]}`}>
          {row.status}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {report.view === 'expiring' ? (
        <section className="grid gap-4 sm:grid-cols-3">
          <OperationMetric label={`Expiring in ${report.days} days`} value={String(report.summary.rows)} tone="amber" />
          <OperationMetric label="Units" value={String(report.summary.units)} />
          <OperationMetric label="Within 7 days" value={String(report.summary.within_7_days)} tone="rose" />
        </section>
      ) : (
        <section className="grid gap-4 sm:grid-cols-4">
          <OperationMetric label="Warranty lines" value={String(report.summary.rows)} tone="indigo" />
          <OperationMetric label="Active" value={String(report.summary.active)} tone="emerald" />
          <OperationMetric label="Expired" value={String(report.summary.expired)} />
          <OperationMetric label="Claimed" value={String(report.summary.claimed)} tone="amber" />
        </section>
      )}
      <ReportTable
        title={report.view === 'expiring' ? `Warranties expiring in the next ${report.days} days` : 'Warranty register'}
        subtitle={report.view === 'expiring'
          ? 'Units still under warranty, soonest expiry first. Useful for reminder calls and extended-warranty offers.'
          : 'Every warranty unit sold in the period (sales invoices and hire purchase) with its current status.'}
        rows={report.rows}
        columns={columns}
        emptyLabel={report.view === 'expiring' ? 'No warranties expire in this window.' : 'No warranty sales in this period.'}
        exportName={report.view === 'expiring' ? 'warranty-expiring' : 'warranty-register'}
        initialSortKey="warranty_expiry_date"
      />
    </div>
  );
}

function CashFlowView({ report }: { report: CashFlowReport | null }) {
  if (!report) return null;

  return (
    <div className="space-y-4">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <OperationMetric label="Opening balance" value={financeMoney(report.summary.opening_balance)} />
        <OperationMetric label="Cash in" value={financeMoney(report.summary.cash_in)} tone="emerald" />
        <OperationMetric label="Cash out" value={financeMoney(report.summary.cash_out)} tone="rose" />
        <OperationMetric label="Closing balance" value={financeMoney(report.summary.closing_balance)} tone="indigo" />
      </section>

      <ReportTable
        title={`Cash in / out · ${report.account.code} ${report.account.description}`}
        subtitle="Ledger-driven cash or bank movement report with running balance and counterpart accounts."
        rows={report.rows}
        emptyLabel="No ledger movements found."
        exportName={`cash-flow-${report.account.code}`}
        initialSortKey="date"
        columns={[
          textColumn('date', 'Date', (row) => row.date),
          textColumn('trance_type', 'Type', (row) => `${row.trance_type} · ${row.trance_no}`),
          textColumn('reference_no', 'Reference', (row) => row.reference_no),
          moneyColumn('cash_in', 'Cash In'),
          moneyColumn('cash_out', 'Cash Out'),
          moneyColumn('running_balance', 'Running Balance'),
          {
            key: 'counterpart_accounts',
            label: 'Counterpart Accounts',
            sortable: true,
            sortValue: (row) => row.counterpart_accounts.join(' '),
            exportValue: (row) => row.counterpart_accounts.join(' | '),
            render: (row) => (row.counterpart_accounts.length ? <CellList items={row.counterpart_accounts} /> : <span className="text-slate-400">—</span>),
          },
          textColumn('uid', 'User', (row) => row.uid),
        ]}
      />
    </div>
  );
}

function DayEndModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [date, setDate] = useState(reportToday());
  const [preview, setPreview] = useState<DayEndPreview | null>(null);
  const [counted, setCounted] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.get<DayEndPreview>(`/v1/reports/day-end-preview?date=${date}`);
        setPreview(response.data || null);
        setCounted(String(response.data?.expected_closing ?? ''));
      } catch (loadError) {
        setError(getApiErrorMessage(loadError));
      }
    }, 100);

    return () => window.clearTimeout(timer);
  }, [date]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await api.post('/v1/reports/day-end-close', {
        close_date: date,
        counted_cash: Number(counted),
        notes: notes || null,
      });
      onSaved();
    } catch (submitError) {
      setError(getApiErrorMessage(submitError));
    } finally {
      setSaving(false);
    }
  }

  return (
    <OperationModal
      title="Close business day"
      description="The expected closing cash becomes the next closed day's opening balance."
      onClose={onClose}
      width="max-w-2xl"
    >
      <form onSubmit={submit} className="space-y-5 p-6">
        {error && <OperationNotice type="error">{error}</OperationNotice>}

        <OperationField label="Business date" required>
          <input
            type="date"
            max={reportToday()}
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
          />
        </OperationField>

        {preview && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <OperationMetric label="Opening" value={financeMoney(preview.opening_balance)} />
              <OperationMetric label="Cash in" value={financeMoney(preview.cash_in)} tone="emerald" />
              <OperationMetric label="Cash out" value={financeMoney(preview.cash_out)} tone="rose" />
              <OperationMetric label="Expected close" value={financeMoney(preview.expected_closing)} tone="indigo" />
            </div>

            {preview.trial_balance_difference !== 0 && (
              <OperationNotice type="error">
                The ledger is out of balance by {financeMoney(preview.trial_balance_difference)}.
              </OperationNotice>
            )}

            {preview.already_closed && (
              <OperationNotice type="error">This day is already closed.</OperationNotice>
            )}
          </>
        )}

        <OperationField label="Counted physical cash" required>
          <input
            type="number"
            step="0.01"
            value={counted}
            onChange={(event) => setCounted(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
          />
        </OperationField>

        {preview && counted !== '' && (
          <div
            className={`rounded-xl p-4 text-sm font-semibold ${
              Math.abs(Number(counted) - preview.expected_closing) > 0.009
                ? 'bg-rose-50 text-rose-700'
                : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            Cash variance: {financeMoney(Number(counted) - preview.expected_closing)}
          </div>
        )}

        <OperationField label="Closing notes">
          <textarea
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5"
          />
        </OperationField>

        <OperationActions
          saving={saving}
          submitLabel="Close business day"
          onCancel={onClose}
          disabled={!preview || preview.already_closed || preview.trial_balance_difference !== 0 || counted === ''}
        />
      </form>
    </OperationModal>
  );
}

function buildQuery(values: Record<string, string | undefined>) {
  const params = new URLSearchParams();

  Object.entries(values).forEach(([key, value]) => {
    if (value && value !== '') {
      params.set(key, value);
    }
  });

  return params.toString();
}

function CellList({ items }: { items: string[] }) {
  const [open, setOpen] = useState(false);
  const visibleItems = items.slice(0, 6);
  const hiddenCount = Math.max(0, items.length - visibleItems.length);

  return (
    <>
      <div className="space-y-1">
        {visibleItems.map((item) => (
          <div key={item} className="rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-700">
            {item}
          </div>
        ))}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
          >
            <Eye className="h-3.5 w-3.5" /> +{hiddenCount} more
          </button>
        )}
      </div>

      {open && (
        <OperationModal
          title={`All entries (${items.length})`}
          description="Full list for this report cell."
          onClose={() => setOpen(false)}
          width="max-w-xl"
        >
          <div className="content-scrollbar max-h-[70vh] space-y-2 p-6">
            {items.map((item, index) => (
              <div
                key={`${item}-${index}`}
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
              >
                {item}
              </div>
            ))}
          </div>
        </OperationModal>
      )}
    </>
  );
}

function moneyColumn<T>(key: keyof T & string, label: string): ReportColumn<T> {
  return {
    key,
    label,
    sortable: true,
    align: 'right',
    sortValue: (row) => Number((row as Record<string, unknown>)[key] || 0),
    exportValue: (row) => Number((row as Record<string, unknown>)[key] || 0),
    render: (row) => financeMoney((row as Record<string, unknown>)[key] as string | number),
  };
}

function numberColumn<T = any>(key: string, label: string, accessor: (row: T) => number): ReportColumn<T> {
  return {
    key,
    label,
    sortable: true,
    align: 'right',
    sortValue: accessor,
    exportValue: accessor,
    render: (row) => <span className="font-semibold">{accessor(row)}</span>,
  };
}

function textColumn<T = any>(key: string, label: string, accessor: (row: T) => string): ReportColumn<T> {
  return {
    key,
    label,
    sortable: true,
    sortValue: accessor,
    exportValue: accessor,
    render: (row) => accessor(row),
  };
}
