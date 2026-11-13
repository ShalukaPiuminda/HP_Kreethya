'use client';

import { FileChartColumn } from 'lucide-react';
import { CrudWorkspace, type CrudRecord } from '@/components/crud-workspace';

interface SchemeRecord extends CrudRecord {
  SchemaType: string;
  DownpaymentPrecentage: string;
  InstallmentRate: string;
  NoOfInstallment: number;
  DocumentCharagePrecentage: string;
  PanaltyCharage: string;
  GracePeriodDays: number;
  IncludeDocumentCharge: boolean | number;
  DownpaymentRequired: boolean | number;
  CollectFirstInstallment: boolean | number;
}

const isOn = (value: unknown) => value === true || value === 1 || value === '1';

export default function SchemasPage() {
  return (
    <CrudWorkspace<SchemeRecord>
      title="Hire Purchase Schemes"
      description="Configure the selectable rates, terms, charges, penalties, and grace periods used by HP agreements."
      endpoint="/v1/schemas"
      module="schemas"
      singular="Scheme"
      plural="Schemes"
      icon={FileChartColumn}
      initialValues={{
        SchemaType: '',
        DownpaymentRequired: '1',
        DownpaymentPrecentage: '',
        InstallmentRate: '',
        NoOfInstallment: '',
        IncludeDocumentCharge: '1',
        DocumentCharagePrecentage: '',
        PanaltyCharage: '',
        GracePeriodDays: '5',
        CollectFirstInstallment: '0',
      }}
      searchKeys={['SchemaType']}
      preparePayload={(payload) =>
        payload.DownpaymentRequired === false
          ? { ...payload, DownpaymentPrecentage: 0 }
          : payload
      }
      fields={[
        {
          name: 'SchemaType',
          label: 'Scheme name',
          required: true,
          placeholder: 'e.g. 12 Month Standard',
          span: 2,
        },
        {
          name: 'DownpaymentRequired',
          label: 'Down payment required',
          type: 'toggle',
          span: 2,
          help: (_record, values) =>
            values.DownpaymentRequired === '0'
              ? 'No down payment is taken. The full item value is financed.'
              : 'A down payment above zero must be entered on every HP sale.',
        },
        {
          name: 'DownpaymentPrecentage',
          label: 'Down payment %',
          type: 'number',
          required: true,
          min: 0,
          max: 100,
          step: 0.01,
          help: 'Shown as the recommended down payment.',
          hidden: (_record, values) => values.DownpaymentRequired === '0',
        },
        {
          name: 'InstallmentRate',
          label: 'Interest rate %',
          type: 'number',
          required: true,
          min: 0,
          max: 100,
          step: 0.01,
        },
        {
          name: 'NoOfInstallment',
          label: 'Installments',
          type: 'number',
          required: true,
          min: 1,
          step: 1,
        },
        {
          name: 'DocumentCharagePrecentage',
          label: 'Document charge %',
          type: 'number',
          required: true,
          min: 0,
          max: 100,
          step: 0.01,
        },
        {
          name: 'IncludeDocumentCharge',
          label: 'Add document charge to capital',
          type: 'toggle',
          span: 2,
          help: (_record, values) =>
            values.IncludeDocumentCharge === '0'
              ? 'Document charge is collected upfront with the down payment, not in the installments.'
              : 'Document charge is added to the financed amount and split into the installments.',
        },
        {
          name: 'PanaltyCharage',
          label: 'Penalty rate %',
          type: 'number',
          required: true,
          min: 0,
          max: 100,
          step: 0.01,
        },
        {
          name: 'GracePeriodDays',
          label: 'Grace period days',
          type: 'number',
          required: true,
          min: 0,
          step: 1,
        },
        {
          name: 'CollectFirstInstallment',
          label: 'Collect 1st installment at sale',
          type: 'toggle',
          span: 2,
          help: 'When on, the HP sale form asks for the 1st installment amount paid when the agreement is created.',
        },
      ]}
      columns={[
        {
          key: 'SchemaType',
          label: 'Scheme',
          render: (record) => (
            <span className="font-semibold text-slate-900">
              {record.SchemaType}
            </span>
          ),
        },
        {
          key: 'DownpaymentPrecentage',
          label: 'Down Pay',
          render: (record) =>
            isOn(record.DownpaymentRequired)
              ? `${record.DownpaymentPrecentage}%`
              : <span className="text-slate-400">Not required</span>,
        },
        {
          key: 'InstallmentRate',
          label: 'Interest',
          render: (record) => `${record.InstallmentRate}%`,
        },
        { key: 'NoOfInstallment', label: 'Terms' },
        {
          key: 'DocumentCharagePrecentage',
          label: 'Doc Charge',
          render: (record) => (
            <span>
              {record.DocumentCharagePrecentage}%
              <span className="ml-1 text-xs text-slate-500">
                · {isOn(record.IncludeDocumentCharge) ? 'in capital' : 'upfront'}
              </span>
            </span>
          ),
        },
        {
          key: 'PanaltyCharage',
          label: 'Penalty',
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
            isOn(record.CollectFirstInstallment)
              ? <span className="font-medium text-emerald-700">At sale</span>
              : <span className="text-slate-400">—</span>,
        },
      ]}
    />
  );
}
