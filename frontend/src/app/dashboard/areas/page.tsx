'use client';

import { useCallback, useState } from 'react';
import { Map, Route as RouteIcon } from 'lucide-react';
import { CrudWorkspace, type CrudRecord } from '@/components/crud-workspace';

interface AreaRecord extends CrudRecord {
  name: string;
  routes_count: number;
}

interface RouteRecord extends CrudRecord {
  name: string;
  area_id: number;
  area?: { id: number; name: string };
}

export default function AreasPage() {
  const [areas, setAreas] = useState<AreaRecord[]>([]);
  const handleAreasChange = useCallback((records: AreaRecord[]) => {
    setAreas(records);
  }, []);

  return (
    <div className="space-y-10">
      <CrudWorkspace<AreaRecord>
        title="Areas"
        description="Define collection and delivery areas before assigning routes."
        endpoint="/v1/areas"
        module="areas"
        singular="Area"
        plural="Areas"
        icon={Map}
        initialValues={{ name: '' }}
        searchKeys={['name']}
        onRecordsChange={handleAreasChange}
        fields={[
          {
            name: 'name',
            label: 'Area name',
            required: true,
            placeholder: 'e.g. Colombo North',
            span: 2,
          },
        ]}
        columns={[
          {
            key: 'name',
            label: 'Area',
            render: (record) => (
              <span className="font-semibold text-slate-900">{record.name}</span>
            ),
          },
          {
            key: 'routes_count',
            label: 'Routes',
            render: (record) => record.routes_count || 0,
          },
        ]}
      />

      <CrudWorkspace<RouteRecord>
        title="Routes"
        description="Create branch routes and connect each route to its operational area."
        endpoint="/v1/routes"
        module="routes"
        singular="Route"
        plural="Routes"
        icon={RouteIcon}
        initialValues={{ name: '', area_id: '' }}
        searchKeys={['name']}
        fields={[
          {
            name: 'name',
            label: 'Route name',
            required: true,
            placeholder: 'e.g. Route 01',
          },
          {
            name: 'area_id',
            label: 'Area',
            type: 'select',
            required: true,
            valueType: 'number',
            options: areas.map((area) => ({
              value: String(area.id),
              label: area.name,
            })),
          },
        ]}
        columns={[
          {
            key: 'name',
            label: 'Route',
            render: (record) => (
              <span className="font-semibold text-slate-900">{record.name}</span>
            ),
          },
          {
            key: 'area',
            label: 'Area',
            render: (record) => record.area?.name || '-',
          },
        ]}
      />
    </div>
  );
}
