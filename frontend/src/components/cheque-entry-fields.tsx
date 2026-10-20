'use client';

import { Building2, CalendarDays, CreditCard, Landmark } from 'lucide-react';
import { OperationField } from '@/components/operation-ui';
import type { ChequeBank, ChequeEntryValue } from '@/lib/payment-options';
import { SearchSelect } from '@/components/search-select';

interface ChequeEntryFieldsProps {
  banks: ChequeBank[];
  value: ChequeEntryValue;
  onChange: (value: ChequeEntryValue) => void;
  dateLabel?: string;
}

const inputClass = 'w-full rounded-xl border border-amber-200 bg-white px-3 py-2.5 outline-none transition focus:border-amber-400 focus:ring-4 focus:ring-amber-100';

export function ChequeEntryFields({
  banks,
  value,
  onChange,
  dateLabel = 'Due Date',
}: ChequeEntryFieldsProps) {
  const branches = banks.find((bank) => String(bank.id) === value.bank_id)?.branches ?? [];

  return (
    <div className="grid gap-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 md:grid-cols-2 xl:grid-cols-5">
      <OperationField label="Cheque Bank" required>
        <div className="relative">
          <Landmark className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-amber-600" />
          <SearchSelect
            value={value.bank_id}
            onChange={(bankId) => onChange({
              ...value,
              bank_id: bankId,
              bank_branch_id: '',
            })}
            options={banks.map((bank) => ({ value: String(bank.id), label: bank.bank_name }))}
            placeholder="Select bank"
            searchPlaceholder="Search banks..."
            className={`${inputClass} pl-9`}
            required
          />
        </div>
      </OperationField>
      <OperationField label="Bank Branch" required>
        <div className="relative">
          <Building2 className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-amber-600" />
          <SearchSelect
            value={value.bank_branch_id}
            onChange={(branchId) => onChange({ ...value, bank_branch_id: branchId })}
            options={branches.map((branch) => ({ value: String(branch.id), label: branch.branch_name, description: branch.branch_code }))}
            placeholder="Select branch"
            searchPlaceholder="Search by branch name or code..."
            className={`${inputClass} pl-9`}
            disabled={!value.bank_id}
            required
          />
        </div>
      </OperationField>
      <OperationField label="Cheque Number" required>
        <div className="relative">
          <CreditCard className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-amber-600" />
          <input
            value={value.cheque_no}
            onChange={(event) => onChange({ ...value, cheque_no: event.target.value })}
            className={`${inputClass} pl-9`}
            required
          />
        </div>
      </OperationField>
      <OperationField label="Cheque Account Number" required>
        <input
          value={value.account_no}
          onChange={(event) => onChange({ ...value, account_no: event.target.value })}
          className={inputClass}
          required
        />
      </OperationField>
      <OperationField label={dateLabel} required>
        <div className="relative">
          <CalendarDays className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-amber-600" />
          <input
            type="date"
            value={value.date}
            onChange={(event) => onChange({ ...value, date: event.target.value })}
            className={`${inputClass} pl-9`}
            required
          />
        </div>
      </OperationField>
    </div>
  );
}
