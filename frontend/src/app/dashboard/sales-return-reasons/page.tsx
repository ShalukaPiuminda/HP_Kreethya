'use client';

import { MessageSquareWarning } from 'lucide-react';
import { CrudWorkspace, type CrudRecord } from '@/components/crud-workspace';

interface ReasonRecord extends CrudRecord {
  reason: string;
}

export default function SalesReturnReasonsPage() {
  return (
    <CrudWorkspace<ReasonRecord>
      title="Sales Return Reasons"
      description="Maintain the approved reasons users must select when processing a sales return."
      endpoint="/v1/sales-return-reasons"
      module="sales-return-reasons"
      singular="Return Reason"
      plural="Return Reasons"
      icon={MessageSquareWarning}
      initialValues={{ reason: '' }}
      searchKeys={['reason']}
      fields={[
        {
          name: 'reason',
          label: 'Reason',
          required: true,
          placeholder: 'e.g. Product damaged on delivery',
          span: 2,
        },
      ]}
      columns={[
        {
          key: 'reason',
          label: 'Reason',
          render: (record) => (
            <span className="font-medium text-slate-900">{record.reason}</span>
          ),
        },
      ]}
    />
  );
}
