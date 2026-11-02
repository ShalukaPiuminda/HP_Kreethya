'use client';

import { Building2 } from 'lucide-react';
import { CrudWorkspace, type CrudRecord } from '@/components/crud-workspace';

interface DepartmentRecord extends CrudRecord {
  name: string;
}

export default function DepartmentsPage() {
  return (
    <CrudWorkspace<DepartmentRecord>
      title="Departments"
      description="Maintain the operational departments used to organize branch responsibilities."
      endpoint="/v1/departments"
      module="departments"
      singular="Department"
      plural="Departments"
      icon={Building2}
      initialValues={{ name: '' }}
      searchKeys={['name']}
      fields={[
        {
          name: 'name',
          label: 'Department name',
          required: true,
          placeholder: 'e.g. Sales',
          span: 2,
        },
      ]}
      columns={[
        {
          key: 'name',
          label: 'Department',
          render: (record) => (
            <span className="font-semibold text-slate-900">{record.name}</span>
          ),
        },
      ]}
    />
  );
}
