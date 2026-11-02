'use client';

import { UsersRound } from 'lucide-react';
import { CrudWorkspace, type CrudRecord } from '@/components/crud-workspace';

interface CustomerRecord extends CrudRecord {
  Code: string;
  name: string;
  NIC: string;
  phone: string | null;
  address: string | null;
  advance_balance: string;
}

export default function CustomersPage() {
  return (
    <CrudWorkspace<CustomerRecord>
      title="Customers"
      description="Maintain customer identity, contact details, and the profiles used by sales and hire purchase."
      endpoint="/v1/customers"
      module="customers"
      singular="Customer"
      plural="Customers"
      icon={UsersRound}
      initialValues={{ name: '', NIC: '', phone: '', address: '' }}
      searchKeys={['Code', 'name', 'NIC', 'phone']}
      fields={[
        {
          name: 'name',
          label: 'Customer name',
          required: true,
          placeholder: 'Full name',
        },
        {
          name: 'NIC',
          label: 'NIC',
          required: true,
          placeholder: 'National identity number',
          minLength: 9,
          maxLength: 15,
        },
        {
          name: 'phone',
          label: 'Mobile number',
          type: 'mobile',
          nullable: true,
          placeholder: '07XXXXXXXX',
          help: 'Used for payment and arrears SMS.',
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
          label: 'Customer',
          render: (record) => (
            <div>
              <div className="font-semibold text-slate-900">{record.name}</div>
              <div className="mt-0.5 text-xs text-slate-500">{record.NIC}</div>
            </div>
          ),
        },
        { key: 'phone', label: 'Phone' },
        {
          key: 'advance_balance',
          label: 'Advance Balance',
          render: (record) => (
            <span className="font-medium text-slate-700">
              LKR {Number(record.advance_balance || 0).toLocaleString()}
            </span>
          ),
        },
      ]}
    />
  );
}
