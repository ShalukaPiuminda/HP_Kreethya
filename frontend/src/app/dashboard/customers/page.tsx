'use client';

import { Lock, UsersRound } from 'lucide-react';
import { CrudWorkspace, type CrudRecord } from '@/components/crud-workspace';
import { useAuth } from '@/lib/auth-context';
import { nicFormHooks, normalizeNic } from '@/lib/nic';

interface CustomerRecord extends CrudRecord {
  Code: string;
  name: string;
  NIC: string | null;
  phone: string | null;
  address: string | null;
  advance_balance: string;
  /** True once the customer has a credit sale or HP agreement. */
  nic_locked?: boolean;
}

/** True when this edit changes the NIC of a locked customer. */
function changingLockedNic(editing: CustomerRecord | null, nic: unknown) {
  return Boolean(editing?.nic_locked) && normalizeNic(String(nic ?? '')) !== normalizeNic(editing?.NIC);
}

export default function CustomersPage() {
  const { hasPermission } = useAuth();
  const canEditLockedNic = hasPermission('customer-nic', 'can_update');
  const nicHooks = nicFormHooks<CustomerRecord>({ updatesLinkedRecords: true, optional: true });

  return (
    <CrudWorkspace<CustomerRecord>
      title="Customers"
      description="Maintain customer identity, contact details, and the profiles used by sales and hire purchase."
      endpoint="/v1/customers"
      module="customers"
      singular="Customer"
      plural="Customers"
      icon={UsersRound}
      initialValues={{ name: '', NIC: '', nic_change_reason: '', phone: '', address: '' }}
      searchKeys={['Code', 'name', 'NIC', 'phone']}
      preparePayload={nicHooks.preparePayload}
      validateSubmit={(payload, editing) => {
        const nicProblem = nicHooks.validateSubmit(payload, editing);
        if (nicProblem) return nicProblem;

        if (changingLockedNic(editing, payload.NIC)) {
          if (normalizeNic(String(payload.NIC ?? '')) === '') {
            return 'The NIC cannot be removed: this customer has credit sales or HP agreements, which need a NIC.';
          }
          if (!canEditLockedNic) {
            return 'This customer has credit sales or HP agreements, so their NIC is locked. Ask a manager or admin with the "Edit NIC" permission.';
          }
          if (String(payload.nic_change_reason ?? '').trim().length < 5) {
            return 'Give a reason for changing the NIC (at least 5 characters).';
          }
        }

        return null;
      }}
      confirmSubmit={(payload, editing) => {
        const message = nicHooks.confirmSubmit(payload, editing);
        const reason = String(payload.nic_change_reason ?? '').trim();
        return message && reason ? `${message}\n\nReason: ${reason}` : message;
      }}
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
          placeholder: '901234567V or 199012304567',
          maxLength: 15,
          disabled: (editing) => Boolean(editing?.nic_locked) && !canEditLockedNic,
          help: (editing) => {
            if (!editing?.nic_locked) {
              return 'Optional for cash customers; required for credit sales and HP. Old: 9 digits + V/X. New: 12 digits.';
            }
            return canEditLockedNic
              ? 'Locked: this customer has credit sales or HP agreements. You can change it, but a reason is required.'
              : 'Locked: this customer has credit sales or HP agreements. Only a manager or admin with the "Edit NIC" permission can change it.';
          },
        },
        {
          name: 'nic_change_reason',
          label: 'Reason for NIC change',
          type: 'textarea',
          nullable: true,
          required: true,
          placeholder: 'e.g. Typo correction, or new NIC card issued',
          help: 'Saved in the change history with your name.',
          span: 2,
          hidden: (editing, values) => !changingLockedNic(editing, values.NIC),
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
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                {record.NIC || <span className="italic text-slate-400">No NIC</span>}
                {record.nic_locked && (
                  <span
                    title="NIC locked: credit sales or HP agreements exist"
                    className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700"
                  >
                    <Lock className="h-2.5 w-2.5" /> Locked
                  </span>
                )}
              </div>
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
