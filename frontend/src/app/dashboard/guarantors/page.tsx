'use client';

import { UserRoundCheck } from 'lucide-react';
import { CrudWorkspace, type CrudRecord } from '@/components/crud-workspace';
import { PHONE_PATTERN, PHONE_TITLE } from '@/lib/phone';

interface GuarantorRecord extends CrudRecord {
  Code: string;
  name: string;
  NIC: string;
  phone: string | null;
  address: string | null;
}

export default function GuarantorsPage() {
  return (
    <CrudWorkspace<GuarantorRecord>
      title="Guarantors"
      description="Maintain guarantor profiles that can be selected during hire purchase applications."
      endpoint="/v1/guarantors"
      module="guarantors"
      singular="Guarantor"
      plural="Guarantors"
      icon={UserRoundCheck}
      initialValues={{ name: '', NIC: '', phone: '', address: '' }}
      searchKeys={['Code', 'name', 'NIC', 'phone']}
      fields={[
        {
          name: 'name',
          label: 'Guarantor name',
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
          label: 'Phone',
          type: 'tel',
          nullable: true,
          placeholder: '07XXXXXXXX',
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
          label: 'Guarantor',
          render: (record) => (
            <div>
              <div className="font-semibold text-slate-900">{record.name}</div>
              <div className="mt-0.5 text-xs text-slate-500">{record.NIC}</div>
            </div>
          ),
        },
        { key: 'phone', label: 'Phone' },
      ]}
    />
  );
}
