'use client';

import { ContactRound } from 'lucide-react';
import { CrudWorkspace, type CrudRecord } from '@/components/crud-workspace';
import { PHONE_PATTERN, PHONE_TITLE } from '@/lib/phone';

interface SalespersonRecord extends CrudRecord {
  name: string;
  phone: string | null;
}

export default function SalespeoplePage() {
  return (
    <CrudWorkspace<SalespersonRecord>
      title="Salespeople"
      description="Maintain branch sales representatives used by invoices, routes, and performance reporting."
      endpoint="/v1/salesmen"
      module="salesmen"
      singular="Salesperson"
      plural="Salespeople"
      icon={ContactRound}
      initialValues={{ name: '', phone: '' }}
      searchKeys={['name', 'phone']}
      fields={[
        {
          name: 'name',
          label: 'Name',
          required: true,
          placeholder: 'Full name',
        },
        {
          name: 'phone',
          label: 'Phone',
          type: 'tel',
          nullable: true,
          placeholder: '07XXXXXXXX',
          maxLength: 25,
          pattern: PHONE_PATTERN,
          patternTitle: PHONE_TITLE,
        },
      ]}
      columns={[
        {
          key: 'name',
          label: 'Salesperson',
          render: (record) => (
            <span className="font-semibold text-slate-900">{record.name}</span>
          ),
        },
        { key: 'phone', label: 'Phone' },
      ]}
    />
  );
}
