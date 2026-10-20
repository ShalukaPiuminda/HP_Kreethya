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
}

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
        DownpaymentPrecentage: '',
        InstallmentRate: '',
        NoOfInstallment: '',
        DocumentCharagePrecentage: '',
        PanaltyCharage: '',
        GracePeriodDays: '5',
      }}
      searchKeys={['SchemaType']}
      fields={[
        {
          name: 'SchemaType',
          label: 'Scheme name',
          required: true,
          placeholder: 'e.g. 12 Month Standard',
          span: 2,
        },
        {
          name: 'DownpaymentPrecentage',
          label: 'Down payment %',
          type: 'number',
          required: true,
          min: 0,
          max: 100,
          step: 0.01,
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
          render: (record) => `${record.DownpaymentPrecentage}%`,
        },
        {
          key: 'InstallmentRate',
          label: 'Interest',
          render: (record) => `${record.InstallmentRate}%`,
        },
        { key: 'NoOfInstallment', label: 'Terms' },
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
      ]}
    />
  );
}
