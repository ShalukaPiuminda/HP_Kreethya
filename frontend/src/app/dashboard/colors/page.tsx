'use client';

import { Palette } from 'lucide-react';
import { CrudWorkspace, type CrudRecord } from '@/components/crud-workspace';

interface ColorRecord extends CrudRecord {
  name: string;
}

export default function ColorsPage() {
  return (
    <CrudWorkspace<ColorRecord>
      title="Colors"
      description="Maintain selectable product colors for item variants."
      endpoint="/v1/colors"
      module="colors"
      singular="Color"
      plural="Colors"
      icon={Palette}
      initialValues={{ name: '' }}
      searchKeys={['name']}
      fields={[
        {
          name: 'name',
          label: 'Color name',
          required: true,
          placeholder: 'e.g. Midnight Black',
          span: 2,
        },
      ]}
      columns={[
        {
          key: 'name',
          label: 'Color',
          render: (record) => (
            <span className="font-semibold text-slate-900">{record.name}</span>
          ),
        },
      ]}
    />
  );
}
