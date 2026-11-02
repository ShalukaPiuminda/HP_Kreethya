'use client';

import { Store } from 'lucide-react';
import { CrudWorkspace, type CrudRecord } from '@/components/crud-workspace';

interface StoreRecord extends CrudRecord {
  name: string;
  location: string | null;
}

export default function StoresPage() {
  return (
    <CrudWorkspace<StoreRecord>
      title="Stores & Warehouses"
      description="Define the physical stock locations available within the current branch."
      endpoint="/v1/stores"
      module="stores"
      singular="Store"
      plural="Stores"
      icon={Store}
      initialValues={{ name: '', location: '' }}
      searchKeys={['name', 'location']}
      fields={[
        {
          name: 'name',
          label: 'Store name',
          required: true,
          placeholder: 'e.g. Main Store',
        },
        {
          name: 'location',
          label: 'Location',
          nullable: true,
          placeholder: 'e.g. Ground Floor',
        },
      ]}
      columns={[
        {
          key: 'name',
          label: 'Store',
          render: (record) => (
            <span className="font-semibold text-slate-900">{record.name}</span>
          ),
        },
        { key: 'location', label: 'Location' },
      ]}
    />
  );
}
