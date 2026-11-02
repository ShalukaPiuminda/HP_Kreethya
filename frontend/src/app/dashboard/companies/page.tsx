'use client';

import { BriefcaseBusiness } from 'lucide-react';
import { CrudWorkspace, type CrudRecord } from '@/components/crud-workspace';
import { PHONE_PATTERN, PHONE_TITLE } from '@/lib/phone';

interface CompanyRecord extends CrudRecord {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo: string | null;
}

export default function CompaniesPage() {
  return (
    <CrudWorkspace<CompanyRecord>
      title="Companies"
      description="Maintain the legal company identities managed by this ERP installation."
      endpoint="/v1/companies"
      module="companies"
      singular="Company"
      plural="Companies"
      icon={BriefcaseBusiness}
      initialValues={{ name: '', phone: '', email: '', address: '', logo: '' }}
      searchKeys={['name', 'phone', 'email']}
      fields={[
        {
          name: 'name',
          label: 'Company name',
          required: true,
          placeholder: 'Registered company name',
          span: 2,
        },
        {
          name: 'phone',
          label: 'Phone',
          type: 'tel',
          nullable: true,
          maxLength: 25,
          pattern: PHONE_PATTERN,
          patternTitle: PHONE_TITLE,
        },
        {
          name: 'email',
          label: 'Email',
          type: 'email',
          nullable: true,
          maxLength: 100,
        },
        {
          name: 'address',
          label: 'Address',
          type: 'textarea',
          nullable: true,
          span: 2,
        },
        {
          name: 'logo',
          label: 'Logo',
          type: 'image',
          nullable: true,
          span: 2,
          help: 'PNG or JPG. Printed on the letterhead of reminder letters together with the address, phone and email above.',
        },
      ]}
      columns={[
        {
          key: 'name',
          label: 'Company',
          render: (record) => (
            <span className="flex items-center gap-3">
              {record.logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={record.logo} alt="" className="h-8 w-8 rounded object-contain ring-1 ring-slate-200" />
              )}
              <span className="font-semibold text-slate-900">{record.name}</span>
            </span>
          ),
        },
        { key: 'phone', label: 'Phone' },
        { key: 'email', label: 'Email' },
      ]}
    />
  );
}
