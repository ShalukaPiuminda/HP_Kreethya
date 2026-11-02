'use client';

import { Truck } from 'lucide-react';
import { CrudWorkspace, type CrudRecord } from '@/components/crud-workspace';
import { PHONE_PATTERN, PHONE_TITLE } from '@/lib/phone';

interface SupplierRecord extends CrudRecord {
  Code: string;
  name: string;
  phone: string | null;
  address: string | null;
  type: 'normal' | 'service';
}

export default function SuppliersPage() {
  return (
    <CrudWorkspace<SupplierRecord>
      title="Suppliers"
      description="Maintain inventory and service suppliers used by purchasing and repair workflows."
      endpoint="/v1/suppliers"
      module="suppliers"
      singular="Supplier"
      plural="Suppliers"
      icon={Truck}
      initialValues={{ name: '', phone: '', address: '', type: 'normal' }}
      searchKeys={['Code', 'name', 'phone', 'type']}
      fields={[
        {
          name: 'name',
          label: 'Supplier name',
          required: true,
          placeholder: 'Business or contact name',
        },
        {
          name: 'type',
          label: 'Supplier type',
          type: 'select',
          required: true,
          options: [
            { value: 'normal', label: 'Inventory supplier' },
            { value: 'service', label: 'Service supplier' },
          ],
        },
        {
          name: 'phone',
          label: 'Phone',
          type: 'tel',
          nullable: true,
          placeholder: 'Contact number',
          maxLength: 25,
          pattern: PHONE_PATTERN,
          patternTitle: PHONE_TITLE,
        },
        {
          name: 'address',
          label: 'Address',
          type: 'textarea',
          nullable: true,
          placeholder: 'Postal address',
          span: 2,
        },
      ]}
      columns={[
        {
          key: 'Code',
          label: 'Code',
          render: (record) => (
            <span className="font-mono text-xs font-semibold text-slate-700">
              {record.Code}
            </span>
          ),
        },
        {
          key: 'name',
          label: 'Supplier',
          render: (record) => (
            <span className="font-semibold text-slate-900">{record.name}</span>
          ),
        },
        { key: 'phone', label: 'Phone' },
        {
          key: 'type',
          label: 'Type',
          render: (record) => (
            <span
              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                record.type === 'service'
                  ? 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-200'
                  : 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
              }`}
            >
              {record.type === 'service' ? 'Service' : 'Inventory'}
            </span>
          ),
        },
      ]}
    />
  );
}
