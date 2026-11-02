'use client';

import { FolderTree } from 'lucide-react';
import {
  CrudWorkspace,
  type CrudRecord,
} from '@/components/crud-workspace';

interface CategoryRecord extends CrudRecord {
  name: string;
  parent_id: number | null;
  parent?: { id: number; name: string } | null;
  children_count: number;
  items_count: number;
  depth?: number;
}

function orderCategories(records: CategoryRecord[]) {
  const children = new Map<number | null, CategoryRecord[]>();

  records.forEach((record) => {
    const siblings = children.get(record.parent_id) || [];
    siblings.push(record);
    children.set(record.parent_id, siblings);
  });

  children.forEach((siblings) =>
    siblings.sort((left, right) => left.name.localeCompare(right.name))
  );

  const ordered: CategoryRecord[] = [];
  const appendChildren = (parentId: number | null, depth: number) => {
    (children.get(parentId) || []).forEach((record) => {
      ordered.push({ ...record, depth });
      appendChildren(record.id, depth + 1);
    });
  };

  appendChildren(null, 0);
  return ordered;
}

function isBelowCategory(
  candidate: CategoryRecord,
  categoryId: number,
  records: CategoryRecord[]
) {
  let parentId = candidate.parent_id;

  while (parentId) {
    if (parentId === categoryId) return true;
    parentId = records.find((record) => record.id === parentId)?.parent_id || null;
  }

  return false;
}

export default function CategoriesPage() {
  return (
    <CrudWorkspace<CategoryRecord>
      title="Categories & Subcategories"
      description="Build a selectable product hierarchy. Categories can contain any number of nested subcategories."
      endpoint="/v1/categories"
      module="categories"
      singular="Category"
      plural="Categories"
      icon={FolderTree}
      initialValues={{ name: '', parent_id: '' }}
      searchKeys={['name']}
      transformRecords={orderCategories}
      fields={[
        {
          name: 'name',
          label: 'Category name',
          required: true,
          placeholder: 'e.g. Electronics',
          span: 2,
        },
        {
          name: 'parent_id',
          label: 'Parent category',
          type: 'select',
          nullable: true,
          valueType: 'number',
          placeholder: 'Top-level category',
          help: 'Leave empty to create a top-level category.',
          span: 2,
          options: (editingRecord, records) =>
            records
              .filter(
                (record) =>
                  record.id !== editingRecord?.id &&
                  (!editingRecord ||
                    !isBelowCategory(record, editingRecord.id, records))
              )
              .map((record) => ({
                value: String(record.id),
                label: `${'  '.repeat(record.depth || 0)}${record.name}`,
              })),
        },
      ]}
      columns={[
        {
          key: 'name',
          label: 'Category',
          render: (record) => (
            <div
              className="flex items-center gap-2 font-semibold text-slate-900"
              style={{ paddingLeft: `${(record.depth || 0) * 22}px` }}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  record.parent_id ? 'bg-indigo-400' : 'bg-slate-700'
                }`}
              />
              {record.name}
            </div>
          ),
        },
        {
          key: 'parent',
          label: 'Parent',
          render: (record) => record.parent?.name || 'Top level',
        },
        {
          key: 'children_count',
          label: 'Subcategories',
          render: (record) => record.children_count || 0,
        },
        {
          key: 'items_count',
          label: 'Items',
          render: (record) => record.items_count || 0,
        },
      ]}
    />
  );
}
