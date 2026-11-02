'use client';

import { Tags } from 'lucide-react';
import { CrudWorkspace, type CrudRecord } from '@/components/crud-workspace';

interface BrandRecord extends CrudRecord {
  name: string;
}

export default function BrandsPage() {
  return (
    <CrudWorkspace<BrandRecord>
      title="Brands"
      description="Maintain product brands used by the item registry."
      endpoint="/v1/brands"
      module="brands"
      singular="Brand"
      plural="Brands"
      icon={Tags}
      initialValues={{ name: '' }}
      searchKeys={['name']}
      fields={[
        {
          name: 'name',
          label: 'Brand name',
          required: true,
          placeholder: 'e.g. Samsung',
          span: 2,
        },
      ]}
      columns={[
        {
          key: 'name',
          label: 'Brand',
          render: (record) => (
            <span className="font-semibold text-slate-900">{record.name}</span>
          ),
        },
      ]}
    />
  );
}
