'use client';

import { Factory } from 'lucide-react';
import { CrudWorkspace, type CrudRecord } from '@/components/crud-workspace';

interface MakeRecord extends CrudRecord {
  name: string;
}

export default function MakesPage() {
  return (
    <CrudWorkspace<MakeRecord>
      title="Makes & Models"
      description="Maintain manufacturer or model groupings used when registering items."
      endpoint="/v1/makes"
      module="makes"
      singular="Make"
      plural="Makes"
      icon={Factory}
      initialValues={{ name: '' }}
      searchKeys={['name']}
      fields={[
        {
          name: 'name',
          label: 'Make or model',
          required: true,
          placeholder: 'e.g. Galaxy Series',
          span: 2,
        },
      ]}
      columns={[
        {
          key: 'name',
          label: 'Make / Model',
          render: (record) => (
            <span className="font-semibold text-slate-900">{record.name}</span>
          ),
        },
      ]}
    />
  );
}
