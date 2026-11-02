'use client';

import { useCallback, useState } from 'react';
import { Building, Landmark } from 'lucide-react';
import { CrudWorkspace, type CrudRecord } from '@/components/crud-workspace';

interface BankRecord extends CrudRecord {
  bank_name: string;
  account_no: string;
  branches_count: number;
}

interface BankBranchRecord extends CrudRecord {
  bank_id: number;
  branch_name: string;
  branch_code: string;
  bank?: { id: number; bank_name: string; account_no: string };
}

export default function BanksPage() {
  const [banks, setBanks] = useState<BankRecord[]>([]);
  const handleBanksChange = useCallback((records: BankRecord[]) => {
    setBanks(records);
  }, []);

  return (
    <div className="space-y-10">
      <CrudWorkspace<BankRecord>
        title="Bank Accounts"
        description="Maintain the branch bank accounts used by payments, deposits, and ledger entries."
        endpoint="/v1/banks"
        module="banks"
        singular="Bank Account"
        plural="Bank Accounts"
        icon={Landmark}
        initialValues={{ bank_name: '', account_no: '' }}
        searchKeys={['bank_name', 'account_no']}
        onRecordsChange={handleBanksChange}
        fields={[
          {
            name: 'bank_name',
            label: 'Bank name',
            required: true,
            placeholder: 'e.g. Commercial Bank',
          },
          {
            name: 'account_no',
            label: 'Account number',
            required: true,
            placeholder: 'e.g. 1234567890',
          },
        ]}
        columns={[
          {
            key: 'bank_name',
            label: 'Bank',
            render: (record) => (
              <span className="font-semibold text-slate-900">
                {record.bank_name}
              </span>
            ),
          },
          { key: 'account_no', label: 'Account Number' },
          {
            key: 'branches_count',
            label: 'Branches',
            render: (record) => record.branches_count || 0,
          },
        ]}
      />

      <CrudWorkspace<BankBranchRecord>
        title="Bank Branches"
        description="Register selectable bank branches against the correct bank account."
        endpoint="/v1/bank-branches"
        module="banks"
        singular="Bank Branch"
        plural="Bank Branches"
        icon={Building}
        initialValues={{ bank_id: '', branch_name: '', branch_code: '' }}
        searchKeys={['branch_name', 'branch_code']}
        fields={[
          {
            name: 'bank_id',
            label: 'Bank account',
            type: 'select',
            required: true,
            valueType: 'number',
            span: 2,
            options: banks.map((bank) => ({
              value: String(bank.id),
              label: `${bank.bank_name} / ${bank.account_no}`,
            })),
          },
          {
            name: 'branch_name',
            label: 'Branch name',
            required: true,
            placeholder: 'e.g. Colombo Fort',
          },
          {
            name: 'branch_code',
            label: 'Branch code',
            required: true,
            placeholder: 'e.g. 001',
          },
        ]}
        columns={[
          {
            key: 'branch_name',
            label: 'Branch',
            render: (record) => (
              <span className="font-semibold text-slate-900">
                {record.branch_name}
              </span>
            ),
          },
          { key: 'branch_code', label: 'Code' },
          {
            key: 'bank',
            label: 'Bank Account',
            render: (record) =>
              record.bank
                ? `${record.bank.bank_name} / ${record.bank.account_no}`
                : '-',
          },
        ]}
      />
    </div>
  );
}
