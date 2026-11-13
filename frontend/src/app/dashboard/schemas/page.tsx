'use client';

import { useState } from 'react';
import {
  AlertCircle,
  Banknote,
  CalendarClock,
  Coins,
  FileChartColumn,
  FileSpreadsheet,
  Layers,
  LoaderCircle,
  Percent,
  Plus,
  Receipt,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { CrudWorkspace, type CrudRecord } from '@/components/crud-workspace';
import type { HpDocumentChargeRange } from '@/lib/hp';

interface SchemeRecord extends CrudRecord {
  SchemaType: string;
  DownpaymentPrecentage: string;
  InstallmentRate: string;
  NoOfInstallment: number;
  DocumentChargeType: 'percentage' | 'fixed' | 'range';
  DocumentCharagePrecentage: string;
  DocumentChargeAmount: string;
  document_charge_ranges?: HpDocumentChargeRange[];
  ranges_json?: string;
  PanaltyCharage: string;
  GracePeriodDays: number;
  IncludeDocumentCharge: boolean | number;
  DownpaymentRequired: boolean | number;
  CollectFirstInstallment: boolean | number;
}

const isOn = (value: unknown) =>
  value === true || value === 1 || value === '1' || value === 'true';

export default function SchemasPage() {
  return (
    <CrudWorkspace<SchemeRecord>
      title="Hire Purchase Schemes"
      description="Configure financing terms, interest rates, down payment rules, penalty grace periods, and document charges."
      endpoint="/v1/schemas"
      module="schemas"
      singular="Scheme"
      plural="Schemes"
      icon={FileChartColumn}
      formWidth="max-w-6xl xl:max-w-7xl"
      initialValues={{
        SchemaType: '',
        DownpaymentRequired: '1',
        DownpaymentPrecentage: '',
        InstallmentRate: '',
        NoOfInstallment: '',
        DocumentChargeType: 'percentage',
        DocumentCharagePrecentage: '',
        DocumentChargeAmount: '',
        ranges_json: '[]',
        IncludeDocumentCharge: '1',
        PanaltyCharage: '',
        GracePeriodDays: '5',
        CollectFirstInstallment: '0',
      }}
      searchKeys={['SchemaType']}
      transformRecords={(records) =>
        records.map((record) => ({
          ...record,
          DocumentChargeType: record.DocumentChargeType || 'percentage',
          ranges_json: JSON.stringify(record.document_charge_ranges || []),
        }))
      }
      preparePayload={(payload) => {
        const next = { ...payload };
        if (next.DownpaymentRequired === false) {
          next.DownpaymentPrecentage = 0;
        }

        const chargeType = (next.DocumentChargeType as string) || 'percentage';
        if (chargeType === 'percentage') {
          next.DocumentChargeAmount = 0;
          delete next.ranges_json;
        } else if (chargeType === 'fixed') {
          next.DocumentCharagePrecentage = 0;
          delete next.ranges_json;
        } else if (chargeType === 'range') {
          next.DocumentCharagePrecentage = 0;
          next.DocumentChargeAmount = 0;
          const ranges =
            typeof next.ranges_json === 'string'
              ? JSON.parse(next.ranges_json || '[]')
              : next.ranges_json || [];
          delete next.ranges_json;
          next.ranges = ranges;
        }

        return next;
      }}
      validateSubmit={(payload) => {
        if (!payload.SchemaType || !String(payload.SchemaType).trim()) {
          return 'Scheme name is required.';
        }
        if (
          !payload.InstallmentRate ||
          Number(payload.InstallmentRate) < 0 ||
          Number(payload.InstallmentRate) > 100
        ) {
          return 'Please enter a valid interest rate between 0% and 100%.';
        }
        if (
          !payload.NoOfInstallment ||
          Number(payload.NoOfInstallment) < 1
        ) {
          return 'Installments must be at least 1 month.';
        }
        if (
          isOn(payload.DownpaymentRequired) &&
          (payload.DownpaymentPrecentage === null ||
            payload.DownpaymentPrecentage === undefined ||
            payload.DownpaymentPrecentage === '' ||
            Number(payload.DownpaymentPrecentage) < 0 ||
            Number(payload.DownpaymentPrecentage) > 100)
        ) {
          return 'Please enter a recommended down payment percentage between 0% and 100%.';
        }

        const chargeType = (payload.DocumentChargeType as string) || 'percentage';
        if (chargeType === 'percentage') {
          if (
            payload.DocumentCharagePrecentage === null ||
            payload.DocumentCharagePrecentage === undefined ||
            payload.DocumentCharagePrecentage === '' ||
            Number(payload.DocumentCharagePrecentage) < 0 ||
            Number(payload.DocumentCharagePrecentage) > 100
          ) {
            return 'Please enter a document charge percentage between 0% and 100%.';
          }
        } else if (chargeType === 'fixed') {
          if (
            payload.DocumentChargeAmount === null ||
            payload.DocumentChargeAmount === undefined ||
            payload.DocumentChargeAmount === '' ||
            Number(payload.DocumentChargeAmount) < 0
          ) {
            return 'Please enter a valid fixed document charge amount (LKR).';
          }
        } else if (chargeType === 'range') {
          const ranges = (payload.ranges as HpDocumentChargeRange[]) || [];
          if (!ranges.length) {
            return 'Please add at least one price bracket range for tiered document charges.';
          }
          for (const r of ranges) {
            if (Number(r.from_amount) >= Number(r.to_amount)) {
              return `Range from amount (${r.from_amount}) must be strictly less than to amount (${r.to_amount}).`;
            }
            if (r.charge_type === 'percentage' && Number(r.charge_value) > 100) {
              return 'Range percentage cannot exceed 100%.';
            }
          }
        }
        return null;
      }}
      renderCustomForm={({
        values,
        setValues,
        editingRecord,
        saving,
        onCancel,
      }) => (
        <SchemeCustomForm
          values={values}
          setValues={setValues}
          editingRecord={editingRecord}
          saving={saving}
          onCancel={onCancel}
        />
      )}
      fields={[
        { name: 'SchemaType', label: 'Scheme Name' },
        { name: 'DownpaymentRequired', label: 'Down Payment Required' },
        { name: 'DownpaymentPrecentage', label: 'Down Payment %' },
        { name: 'InstallmentRate', label: 'Interest Rate %' },
        { name: 'NoOfInstallment', label: 'Installments' },
        { name: 'DocumentChargeType', label: 'Document Charge Type' },
        { name: 'DocumentCharagePrecentage', label: 'Document Charge %' },
        { name: 'DocumentChargeAmount', label: 'Fixed Document Charge' },
        { name: 'ranges_json', label: 'Ranges' },
        { name: 'IncludeDocumentCharge', label: 'In Capital' },
        { name: 'PanaltyCharage', label: 'Penalty %' },
        { name: 'GracePeriodDays', label: 'Grace Period Days' },
        { name: 'CollectFirstInstallment', label: 'Collect 1st Inst' },
      ]}
      columns={[
        {
          key: 'SchemaType',
          label: 'Scheme',
          render: (record) => (
            <div>
              <span className="font-semibold text-slate-900">
                {record.SchemaType}
              </span>
              <div className="text-xs text-slate-500">
                {record.NoOfInstallment} months @ {record.InstallmentRate}% interest
              </div>
            </div>
          ),
        },
        {
          key: 'DownpaymentPrecentage',
          label: 'Down Payment',
          render: (record) =>
            isOn(record.DownpaymentRequired) ? (
              <span className="font-medium text-slate-800">
                {record.DownpaymentPrecentage}%
              </span>
            ) : (
              <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                No down pay
              </span>
            ),
        },
        {
          key: 'InstallmentRate',
          label: 'Interest Rate',
          render: (record) => `${record.InstallmentRate}%`,
        },
        {
          key: 'NoOfInstallment',
          label: 'Terms',
          render: (record) => `${record.NoOfInstallment} mos`,
        },
        {
          key: 'DocumentCharagePrecentage',
          label: 'Doc Charge',
          render: (record) => {
            const type = record.DocumentChargeType || 'percentage';
            const suffix = isOn(record.IncludeDocumentCharge)
              ? 'in capital'
              : 'upfront';

            if (type === 'fixed') {
              return (
                <span>
                  LKR{' '}
                  {Number(record.DocumentChargeAmount || 0).toLocaleString(
                    undefined,
                    { minimumFractionDigits: 2, maximumFractionDigits: 2 }
                  )}
                  <span className="ml-1 text-xs text-slate-500">· {suffix}</span>
                </span>
              );
            }

            if (type === 'range') {
              const ranges = record.document_charge_ranges || [];
              const count = ranges.length;
              return (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                    <Layers className="h-3 w-3" />
                    Tiered ({count} {count === 1 ? 'tier' : 'tiers'})
                  </span>
                  <span className="text-xs text-slate-500">· {suffix}</span>
                </span>
              );
            }

            return (
              <span>
                {record.DocumentCharagePrecentage}%
                <span className="ml-1 text-xs text-slate-500">· {suffix}</span>
              </span>
            );
          },
        },
        {
          key: 'PanaltyCharage',
          label: 'Late Penalty',
          render: (record) => `${record.PanaltyCharage}%`,
        },
        {
          key: 'GracePeriodDays',
          label: 'Grace',
          render: (record) => `${record.GracePeriodDays} days`,
        },
        {
          key: 'CollectFirstInstallment',
          label: '1st Inst.',
          render: (record) =>
            isOn(record.CollectFirstInstallment) ? (
              <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                At sale
              </span>
            ) : (
              <span className="text-slate-400">—</span>
            ),
        },
      ]}
    />
  );
}

function SchemeCustomForm({
  values,
  setValues,
  editingRecord,
  saving,
  onCancel,
}: {
  values: Record<string, string>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  editingRecord: SchemeRecord | null;
  saving: boolean;
  onCancel: () => void;
}) {
  const update = (key: string, val: string) =>
    setValues((prev) => ({ ...prev, [key]: val }));

  const toggle = (key: string) =>
    setValues((prev) => ({ ...prev, [key]: isOn(prev[key]) ? '0' : '1' }));

  const dpRequired = isOn(values.DownpaymentRequired);
  const docInCapital = isOn(values.IncludeDocumentCharge);
  const collectFirst = isOn(values.CollectFirstInstallment);
  const docChargeType =
    (values.DocumentChargeType as 'percentage' | 'fixed' | 'range') ||
    'percentage';

  const rangesCount = (() => {
    try {
      return (JSON.parse(values.ranges_json || '[]') as unknown[]).length;
    } catch {
      return 0;
    }
  })();

  return (
    <div className="space-y-6">
      {/* 2-Column Split: Left (Terms & Policies) | Right (Document Charges) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* ================= LEFT COLUMN ================= */}
        <div className="space-y-5 lg:col-span-6">
          {/* Card 1: Scheme Identification & Financing Terms */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition hover:border-slate-300">
            <div className="mb-4 flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-100">
                <FileSpreadsheet className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Scheme Profile & Terms
                </h3>
                <p className="text-xs text-slate-500">
                  Core tenure, interest, and late penalty rules
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                  Scheme Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 12 Month Standard Scheme"
                  value={values.SchemaType}
                  onChange={(e) => update('SchemaType', e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Tenure (Months) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min="1"
                      step="1"
                      placeholder="e.g. 12"
                      value={values.NoOfInstallment}
                      onChange={(e) => update('NoOfInstallment', e.target.value)}
                      className="w-full rounded-xl border border-slate-300 pr-12 pl-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-slate-400">
                      inst.
                    </span>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Interest Rate <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="e.g. 14.0"
                      value={values.InstallmentRate}
                      onChange={(e) => update('InstallmentRate', e.target.value)}
                      className="w-full rounded-xl border border-slate-300 pr-8 pl-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-slate-400">
                      %
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Late Penalty Rate <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="e.g. 2.5"
                      value={values.PanaltyCharage}
                      onChange={(e) => update('PanaltyCharage', e.target.value)}
                      className="w-full rounded-xl border border-slate-300 pr-8 pl-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-slate-400">
                      %
                    </span>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Grace Period <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min="0"
                      step="1"
                      placeholder="e.g. 5"
                      value={values.GracePeriodDays}
                      onChange={(e) => update('GracePeriodDays', e.target.value)}
                      className="w-full rounded-xl border border-slate-300 pr-12 pl-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-slate-400">
                      days
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Down Payment Policies */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition hover:border-slate-300">
            <div className="mb-4 flex items-center gap-2.5 border-b border-slate-100 pb-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-100">
                <Coins className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Down Payment & Advance
                </h3>
                <p className="text-xs text-slate-500">
                  Initial customer commitment rules at time of sale
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Down Payment Required Toggle */}
              <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">
                      Down payment required
                    </span>
                    <span
                      className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                        dpRequired
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {dpRequired ? 'Mandatory' : '100% Financed'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {dpRequired
                      ? 'Customer must pay a down payment when agreement is opened.'
                      : 'No down payment taken. Full item value is financed into installments.'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={dpRequired}
                  onClick={() => toggle('DownpaymentRequired')}
                  className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                    dpRequired ? 'bg-indigo-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow-xs transition ${
                      dpRequired ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* Recommended Down Payment % (conditionally shown) */}
              {dpRequired && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3.5">
                  <label className="mb-1 block text-xs font-semibold text-emerald-900">
                    Recommended Down Payment (%) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="e.g. 20.0"
                      value={values.DownpaymentPrecentage}
                      onChange={(e) => update('DownpaymentPrecentage', e.target.value)}
                      className="w-full rounded-xl border border-emerald-200 bg-white pr-8 pl-3.5 py-2 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-emerald-600">
                      %
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-emerald-700">
                    Calculated automatically as the recommended minimum on the HP sale screen.
                  </p>
                </div>
              )}

              {/* Collect First Installment Toggle */}
              <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">
                      Collect 1st installment at sale
                    </span>
                    <span
                      className={`inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                        collectFirst
                          ? 'bg-indigo-100 text-indigo-800'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {collectFirst ? 'At Sale' : 'Month 1 Start'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {collectFirst
                      ? 'Sale screen will prompt for the 1st installment payment upfront.'
                      : 'Repayments start on the due date of month 1.'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={collectFirst}
                  onClick={() => toggle('CollectFirstInstallment')}
                  className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                    collectFirst ? 'bg-indigo-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow-xs transition ${
                      collectFirst ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ================= RIGHT COLUMN ================= */}
        <div className="space-y-5 lg:col-span-6">
          {/* Card 3: Document Charge Configuration */}
          <div className="rounded-2xl border border-indigo-100 bg-gradient-to-b from-indigo-50/30 to-white p-5 shadow-xs">
            <div className="mb-4 flex items-center justify-between border-b border-indigo-100/70 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-xs">
                  <Receipt className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Document Charge Setup
                  </h3>
                  <p className="text-xs text-slate-500">
                    Fee calculation mode and capital inclusion
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {/* Inclusion Toggle Card */}
              <div className="flex items-start justify-between gap-4 rounded-xl border border-indigo-200/80 bg-white p-3.5 shadow-2xs">
                <div className="min-w-0">
                  <span className="block text-xs font-bold text-slate-900">
                    Add charge to financed capital
                  </span>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {docInCapital
                      ? 'Financed into installments (split equally over loan terms).'
                      : 'Collected upfront with the down payment at sale.'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={docInCapital}
                  onClick={() => toggle('IncludeDocumentCharge')}
                  className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition focus:outline-none focus:ring-2 focus:ring-indigo-200 ${
                    docInCapital ? 'bg-indigo-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-5 w-5 rounded-full bg-white shadow-xs transition ${
                      docInCapital ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>

              {/* Mode Selector Radio Cards */}
              <div>
                <label className="mb-2 block text-xs font-semibold text-slate-700">
                  Fee Calculation Mode <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {/* Mode 1: Percentage */}
                  <button
                    type="button"
                    onClick={() => update('DocumentChargeType', 'percentage')}
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2.5 text-center transition ${
                      docChargeType === 'percentage'
                        ? 'border-indigo-600 bg-indigo-50/70 font-semibold text-indigo-900 shadow-2xs ring-1 ring-indigo-500'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <Percent
                      className={`h-4 w-4 ${
                        docChargeType === 'percentage'
                          ? 'text-indigo-600'
                          : 'text-slate-400'
                      }`}
                    />
                    <span className="text-xs">Percentage</span>
                    <span className="text-[10px] text-slate-400">
                      % of principal
                    </span>
                  </button>

                  {/* Mode 2: Fixed */}
                  <button
                    type="button"
                    onClick={() => update('DocumentChargeType', 'fixed')}
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2.5 text-center transition ${
                      docChargeType === 'fixed'
                        ? 'border-indigo-600 bg-indigo-50/70 font-semibold text-indigo-900 shadow-2xs ring-1 ring-indigo-500'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <Banknote
                      className={`h-4 w-4 ${
                        docChargeType === 'fixed'
                          ? 'text-indigo-600'
                          : 'text-slate-400'
                      }`}
                    />
                    <span className="text-xs">Fixed Value</span>
                    <span className="text-[10px] text-slate-400">
                      Flat LKR fee
                    </span>
                  </button>

                  {/* Mode 3: Range */}
                  <button
                    type="button"
                    onClick={() => update('DocumentChargeType', 'range')}
                    className={`flex flex-col items-center justify-center gap-1 rounded-xl border p-2.5 text-center transition ${
                      docChargeType === 'range'
                        ? 'border-indigo-600 bg-indigo-50/70 font-semibold text-indigo-900 shadow-2xs ring-1 ring-indigo-500'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <Layers
                      className={`h-4 w-4 ${
                        docChargeType === 'range'
                          ? 'text-indigo-600'
                          : 'text-slate-400'
                      }`}
                    />
                    <span className="text-xs">Tiered Range</span>
                    <span className="text-[10px] text-slate-400">
                      Price brackets
                    </span>
                  </button>
                </div>
              </div>

              {/* Mode Specific Inputs */}
              {docChargeType === 'percentage' && (
                <div className="rounded-xl border border-indigo-100 bg-white p-4 shadow-2xs">
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Document Charge Rate (%) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min="0"
                      max="100"
                      step="0.01"
                      placeholder="e.g. 2.0"
                      value={values.DocumentCharagePrecentage}
                      onChange={(e) =>
                        update('DocumentCharagePrecentage', e.target.value)
                      }
                      className="w-full rounded-xl border border-slate-300 pr-8 pl-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-slate-400">
                      %
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">
                    Calculated dynamically on the agreement&apos;s financed principal (Net Item Price − Down Payment).
                  </p>
                </div>
              )}

              {docChargeType === 'fixed' && (
                <div className="rounded-xl border border-indigo-100 bg-white p-4 shadow-2xs">
                  <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                    Fixed Document Charge (LKR) <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-xs font-semibold text-slate-400">
                      LKR
                    </span>
                    <input
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      placeholder="e.g. 500.00"
                      value={values.DocumentChargeAmount}
                      onChange={(e) =>
                        update('DocumentChargeAmount', e.target.value)
                      }
                      className="w-full rounded-xl border border-slate-300 pr-3.5 pl-12 py-2.5 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">
                    A flat, fixed fee applied to the agreement regardless of total item price or down payment.
                  </p>
                </div>
              )}

              {docChargeType === 'range' && (
                <RangeManager
                  rangesJson={values.ranges_json || '[]'}
                  onChange={(newJson) => update('ranges_json', newJson)}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ================= BOTTOM LIVE SUMMARY BANNER ================= */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 via-indigo-50/20 to-slate-50 p-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Scheme Overview
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs ring-1 ring-slate-200">
              <CalendarClock className="h-3.5 w-3.5 text-indigo-600" />
              {values.NoOfInstallment || '—'} Months
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs ring-1 ring-slate-200">
              <Percent className="h-3.5 w-3.5 text-indigo-600" />
              {values.InstallmentRate || 0}% Interest
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs ring-1 ring-slate-200">
              <Coins className="h-3.5 w-3.5 text-emerald-600" />
              {dpRequired
                ? `${values.DownpaymentPrecentage || 0}% Down Pay`
                : 'No Down Pay'}
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-2xs ring-1 ring-slate-200">
              <Receipt className="h-3.5 w-3.5 text-indigo-600" />
              Doc:{' '}
              {docChargeType === 'fixed'
                ? `LKR ${Number(values.DocumentChargeAmount || 0).toLocaleString()}`
                : docChargeType === 'range'
                ? `Tiered (${rangesCount} tiers)`
                : `${values.DocumentCharagePrecentage || 0}%`}{' '}
              · {docInCapital ? 'in capital' : 'upfront'}
            </span>
            {collectFirst && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 shadow-2xs ring-1 ring-emerald-200">
                1st Inst. at sale
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ================= MODAL ACTIONS FOOTER ================= */}
      <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-xl px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-indigo-200 transition hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
          {editingRecord ? 'Save Changes' : 'Create Scheme'}
        </button>
      </div>
    </div>
  );
}

function RangeManager({
  rangesJson,
  onChange,
}: {
  rangesJson: string;
  onChange: (value: string) => void;
}) {
  const ranges: HpDocumentChargeRange[] = (() => {
    try {
      return JSON.parse(rangesJson) || [];
    } catch {
      return [];
    }
  })();

  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [chargeType, setChargeType] = useState<'percentage' | 'fixed'>('percentage');
  const [chargeValue, setChargeValue] = useState('');
  const [entryError, setEntryError] = useState<string | null>(null);

  const handleAdd = () => {
    setEntryError(null);
    const from = Number(fromAmount);
    const to = Number(toAmount);
    const val = Number(chargeValue);

    if (isNaN(from) || from < 0 || isNaN(to) || to <= 0) {
      setEntryError('Enter valid positive numbers for range bounds.');
      return;
    }
    if (from >= to) {
      setEntryError('"From" amount must be strictly less than "To" amount.');
      return;
    }
    if (isNaN(val) || val < 0) {
      setEntryError('Enter a valid charge value.');
      return;
    }
    if (chargeType === 'percentage' && val > 100) {
      setEntryError('Percentage fee cannot exceed 100%.');
      return;
    }

    // Overlap validation
    for (const existing of ranges) {
      const exFrom = Number(existing.from_amount);
      const exTo = Number(existing.to_amount);
      if (!(to < exFrom || from > exTo)) {
        setEntryError(
          `Range LKR ${from.toLocaleString()}–${to.toLocaleString()} overlaps with existing range ${exFrom.toLocaleString()}–${exTo.toLocaleString()}.`
        );
        return;
      }
    }

    const updated = [
      ...ranges,
      {
        from_amount: from,
        to_amount: to,
        charge_type: chargeType,
        charge_value: val,
      },
    ].sort((a, b) => Number(a.from_amount) - Number(b.from_amount));

    onChange(JSON.stringify(updated));
    setFromAmount('');
    setToAmount('');
    setChargeValue('');
  };

  const handleRemove = (index: number) => {
    const updated = ranges.filter((_, i) => i !== index);
    onChange(JSON.stringify(updated));
  };

  return (
    <div className="space-y-3 rounded-xl border border-indigo-200 bg-white p-4 shadow-2xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
          <Layers className="h-4 w-4 text-indigo-600" />
          <span>Configured Price Brackets</span>
        </div>
        <span className="text-[11px] font-medium text-slate-400">
          Matches total Net Item Value
        </span>
      </div>

      {ranges.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-100/70 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              <tr>
                <th className="px-3 py-2">Bracket Range (LKR)</th>
                <th className="px-3 py-2">Charge Type</th>
                <th className="px-3 py-2 text-right">Fee</th>
                <th className="px-3 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 bg-white">
              {ranges.map((r, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-mono font-medium text-slate-800">
                    {Number(r.from_amount).toLocaleString()} –{' '}
                    {Number(r.to_amount).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    {r.charge_type === 'percentage' ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700">
                        <Percent className="h-3 w-3" /> % of Principal
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        <Banknote className="h-3 w-3" /> Fixed Amount
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-bold text-slate-900">
                    {r.charge_type === 'percentage'
                      ? `${r.charge_value}%`
                      : `LKR ${Number(r.charge_value).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}`}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleRemove(i)}
                      className="rounded-lg p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                      title="Remove tier"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 py-3 text-center text-xs text-slate-400">
          No tiers defined yet. Add the first price bracket below.
        </div>
      )}

      {entryError && (
        <div className="flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{entryError}</span>
        </div>
      )}

      {/* Add New Bracket Form */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/30 p-3">
        <span className="mb-2 block text-[11px] font-bold uppercase tracking-wider text-indigo-900">
          + Add New Price Bracket
        </span>
        <div className="grid grid-cols-2 items-end gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600">
              From (LKR)
            </label>
            <input
              type="number"
              min="0"
              step="1"
              placeholder="100"
              value={fromAmount}
              onChange={(e) => setFromAmount(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600">
              To (LKR)
            </label>
            <input
              type="number"
              min="1"
              step="1"
              placeholder="5000"
              value={toAmount}
              onChange={(e) => setToAmount(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600">
              Charge Type
            </label>
            <select
              value={chargeType}
              onChange={(e) =>
                setChargeType(e.target.value as 'percentage' | 'fixed')
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
            >
              <option value="percentage">Percentage (%)</option>
              <option value="fixed">Fixed (LKR)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-600">
              {chargeType === 'percentage' ? 'Rate (%)' : 'Amount (LKR)'}
            </label>
            <input
              type="number"
              min="0"
              max={chargeType === 'percentage' ? '100' : undefined}
              step={chargeType === 'percentage' ? '0.01' : '1'}
              placeholder={chargeType === 'percentage' ? '2.0' : '250'}
              value={chargeValue}
              onChange={(e) => setChargeValue(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
            />
          </div>
          <div className="col-span-2 xl:col-span-1">
            <button
              type="button"
              onClick={handleAdd}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-indigo-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Tier
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
