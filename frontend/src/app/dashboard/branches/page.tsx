'use client';

import { useEffect, useState } from 'react';
import { GitBranch } from 'lucide-react';
import { CrudWorkspace, type CrudRecord } from '@/components/crud-workspace';
import { api } from '@/lib/api';
import { PHONE_PATTERN, PHONE_TITLE } from '@/lib/phone';

interface BranchRecord extends CrudRecord {
  company_id: number | null;
  bccode: string;
  name: string;
  phone: string | null;
  address: string | null;
  is_active: boolean;
  company?: {
    id: number;
    name: string;
  } | null;
}

interface CompanyOption {
  id: number;
  name: string;
}

export default function BranchesPage() {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);

  useEffect(() => {
    let mounted = true;
    api.getAll<CompanyOption>('/v1/companies')
      .then((response) => {
        if (mounted) setCompanies(response.data ?? []);
      })
      .catch(() => {
        if (mounted) setCompanies([]);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <CrudWorkspace<BranchRecord>
      title="Branches"
      description="Maintain the branch codes that partition users, masters, stock, and transactions."
      endpoint="/v1/branches"
      module="branches"
      singular="Branch"
      plural="Branches"
      icon={GitBranch}
      initialValues={{ company_id: '', bccode: '', name: '', phone: '', address: '', is_active: 'true' }}
      searchKeys={['bccode', 'name', 'phone']}
      fields={[
        {
          name: 'company_id',
          label: 'Company',
          type: 'select',
          valueType: 'number',
          nullable: true,
          placeholder: 'Select company',
          options: companies.map((company) => ({
            value: company.id.toString(),
            label: company.name,
          })),
        },
        {
          name: 'bccode',
          label: 'Branch code',
          required: true,
          placeholder: 'e.g. HQ',
        },
        {
          name: 'name',
          label: 'Branch name',
          required: true,
          placeholder: 'e.g. Head Office',
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
          name: 'address',
          label: 'Address',
          type: 'textarea',
          nullable: true,
          span: 2,
        },
        {
          name: 'is_active',
          label: 'Status',
          type: 'select',
          required: true,
          options: [
            { value: 'true', label: 'Active' },
            { value: 'false', label: 'Inactive' },
          ],
        },
      ]}
      columns={[
        {
          key: 'company_id',
          label: 'Company',
          render: (record) => (
            <span className="font-semibold text-slate-700">
              {record.company?.name ?? 'No company'}
            </span>
          ),
        },
        {
          key: 'bccode',
          label: 'Code',
          render: (record) => (
            <span className="font-mono text-xs font-bold text-indigo-700">
              {record.bccode}
            </span>
          ),
        },
        {
          key: 'name',
          label: 'Branch',
          render: (record) => (
            <span className="font-semibold text-slate-900">{record.name}</span>
          ),
        },
        { key: 'phone', label: 'Phone' },
        {
          key: 'is_active',
          label: 'Status',
          render: (record) => (
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${record.is_active ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200'}`}>
              {record.is_active ? 'Active' : 'Inactive'}
            </span>
          ),
        },
      ]}
    />
  );
}
