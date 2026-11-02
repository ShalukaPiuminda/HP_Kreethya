'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCcw,
  Search,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { ApiError, api, getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { OperationNotice } from './operation-ui';
import { MobileInput, toLocalMobile } from './mobile-input';
import { SearchSelect } from '@/components/search-select';
import { usePopupKeyboard } from '@/lib/use-popup-keyboard';

export interface CrudRecord {
  id: number;
  [key: string]: unknown;
}

export interface SelectOption {
  label: string;
  value: string;
}

export interface CrudField<TRecord extends CrudRecord = CrudRecord> {
  name: string;
  label: string;
  /** 'mobile' = Sri Lankan mobile: digits only, 10 characters, validated while typing. */
  /** 'image' = uploaded picture stored as a resized base64 data URL. */
  type?: 'text' | 'email' | 'tel' | 'mobile' | 'number' | 'textarea' | 'select' | 'image';
  required?: boolean;
  placeholder?: string;
  help?: string;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  /** Shown by the browser when the value does not match `pattern`. */
  patternTitle?: string;
  step?: number;
  valueType?: 'string' | 'number';
  nullable?: boolean;
  options?:
    | SelectOption[]
    | ((
        editingRecord: TRecord | null,
        records: TRecord[]
      ) => SelectOption[]);
  span?: 1 | 2;
}

export interface CrudColumn<TRecord extends CrudRecord> {
  key: string;
  label: string;
  className?: string;
  render?: (record: TRecord, records: TRecord[]) => React.ReactNode;
}

function buildErrorNotice(error: unknown, fallback: string) {
  const details =
    error instanceof ApiError && error.errors
      ? Object.values(error.errors)
          .flat()
          .filter((detail): detail is string => Boolean(detail))
      : [];

  return {
    type: 'error' as const,
    message: getApiErrorMessage(error, fallback),
    details: details.length > 0 ? details : undefined,
  };
}

interface CrudWorkspaceProps<TRecord extends CrudRecord> {
  title: string;
  description: string;
  endpoint: string;
  module: string;
  singular: string;
  plural: string;
  icon: LucideIcon;
  fields: CrudField<TRecord>[];
  columns: CrudColumn<TRecord>[];
  initialValues: Record<string, string>;
  searchKeys: string[];
  searchPlaceholder?: string;
  addLabel?: string;
  emptyMessage?: string;
  transformRecords?: (records: TRecord[]) => TRecord[];
  transformSubmit?: (
    values: Record<string, string>,
    editingRecord: TRecord | null
  ) => Record<string, unknown>;
  onRecordsChange?: (records: TRecord[]) => void;
}

export function CrudWorkspace<TRecord extends CrudRecord>({
  title,
  description,
  endpoint,
  module,
  singular,
  plural,
  icon: Icon,
  fields,
  columns,
  initialValues,
  searchKeys,
  searchPlaceholder,
  addLabel,
  emptyMessage,
  transformRecords,
  transformSubmit,
  onRecordsChange,
}: CrudWorkspaceProps<TRecord>) {
  const { hasPermission } = useAuth();
  const [records, setRecords] = useState<TRecord[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingRecord, setEditingRecord] = useState<TRecord | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [values, setValues] = useState(initialValues);
  const formPanelRef = useRef<HTMLDivElement>(null);
  usePopupKeyboard(formPanelRef, () => {
    if (!saving) setShowForm(false);
  }, showForm);
  const [notice, setNotice] = useState<{
    type: 'success' | 'error';
    message: string;
    details?: string[];
  } | null>(null);

  const canCreate = hasPermission(module, 'can_create');
  const canRead = hasPermission(module, 'can_read');
  const canUpdate = hasPermission(module, 'can_update');
  const canDelete = hasPermission(module, 'can_delete');

  const fetchRecords = useCallback(async () => {
    if (!canRead) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setNotice(null);

    try {
      const response = await api.getAll<TRecord>(endpoint);
      const nextRecords = response.data || [];
      const preparedRecords = transformRecords
        ? transformRecords(nextRecords)
        : nextRecords;
      setRecords(preparedRecords);
      onRecordsChange?.(preparedRecords);
    } catch (error: unknown) {
      setNotice(buildErrorNotice(error, `Unable to load ${plural}.`));
    } finally {
      setLoading(false);
    }
  }, [canRead, endpoint, onRecordsChange, plural, transformRecords]);

  useEffect(() => {
    const timer = window.setTimeout(fetchRecords, 0);
    return () => window.clearTimeout(timer);
  }, [fetchRecords]);

  const filteredRecords = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return records;

    return records.filter((record) =>
      searchKeys.some((key) =>
        String(record[key] ?? '')
          .toLowerCase()
          .includes(term)
      )
    );
  }, [records, search, searchKeys]);

  if (!canRead) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800">
        You do not have permission to view {plural.toLowerCase()}.
      </div>
    );
  }

  const openCreate = () => {
    setEditingRecord(null);
    setValues(initialValues);
    setNotice(null);
    setShowForm(true);
  };

  const openEdit = (record: TRecord) => {
    const nextValues = { ...initialValues };

    fields.forEach((field) => {
      const value = record[field.name];
      nextValues[field.name] =
        value === null || value === undefined ? '' : String(value);
    });

    setEditingRecord(record);
    setValues(nextValues);
    setNotice(null);
    setShowForm(true);
  };

  const buildPayload = () => {
    if (transformSubmit) return transformSubmit(values, editingRecord);

    return fields.reduce<Record<string, unknown>>((payload, field) => {
      const rawValue = values[field.name] ?? '';
      // Send exactly what the mobile input shows (digits only, 07XXXXXXXX).
      const value = field.type === 'mobile' ? toLocalMobile(rawValue) : rawValue;

      if (value === '' && field.nullable) {
        payload[field.name] = null;
      } else if (field.valueType === 'number' || field.type === 'number') {
        payload[field.name] = value === '' ? null : Number(value);
      } else {
        payload[field.name] = value;
      }

      return payload;
    }, {});
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setNotice(null);

    try {
      const payload = buildPayload();

      if (editingRecord) {
        await api.put(`${endpoint}/${editingRecord.id}`, payload);
      } else {
        await api.post(endpoint, payload);
      }

      setShowForm(false);
      await fetchRecords();
      setNotice({
        type: 'success',
        message: `${singular} ${editingRecord ? 'updated' : 'created'} successfully.`,
      });
    } catch (error: unknown) {
      setNotice(buildErrorNotice(error, `Unable to save ${singular}.`));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (record: TRecord) => {
    if (!window.confirm(`Delete this ${singular.toLowerCase()}?`)) return;

    setDeletingId(record.id);
    setNotice(null);

    try {
      await api.delete(`${endpoint}/${record.id}`);
      await fetchRecords();
      setNotice({
        type: 'success',
        message: `${singular} deleted successfully.`,
      });
    } catch (error: unknown) {
      setNotice(buildErrorNotice(error, `Unable to delete ${singular}.`));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 ring-1 ring-inset ring-indigo-100">
            <Icon className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950">
              {title}
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">
              {description}
            </p>
          </div>
        </div>

        {canCreate && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700"
          >
            <Plus className="h-4 w-4" />
            {addLabel || `New ${singular}`}
          </button>
        )}
      </section>

      {notice && (
        <OperationNotice type={notice.type} details={notice.details}>
          {notice.message}
        </OperationNotice>
      )}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={searchPlaceholder || `Search ${plural.toLowerCase()}...`}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-indigo-300 focus:bg-white focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <span className="text-xs font-medium text-slate-500">
              {filteredRecords.length} {filteredRecords.length === 1 ? singular : plural}
            </span>
            <button
              type="button"
              onClick={fetchRecords}
              disabled={loading}
              className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-indigo-600 disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCcw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500">
                {columns.map((column) => (
                  <th key={column.key} className={`px-5 py-3.5 ${column.className || ''}`}>
                    {column.label}
                  </th>
                ))}
                {(canUpdate || canDelete) && (
                  <th className="px-5 py-3.5 text-right">Actions</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td
                    colSpan={columns.length + (canUpdate || canDelete ? 1 : 0)}
                    className="px-5 py-14 text-center text-slate-400"
                  >
                    <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin text-indigo-600" />
                    Loading {plural.toLowerCase()}...
                  </td>
                </tr>
              ) : filteredRecords.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + (canUpdate || canDelete ? 1 : 0)}
                    className="px-5 py-14 text-center text-slate-400"
                  >
                    {emptyMessage || `No ${plural.toLowerCase()} found.`}
                  </td>
                </tr>
              ) : (
                filteredRecords.map((record) => (
                  <tr key={record.id} className="transition hover:bg-slate-50/80">
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={`px-5 py-3.5 text-slate-700 ${column.className || ''}`}
                      >
                        {column.render
                          ? column.render(record, records)
                          : String(record[column.key] ?? '-')}
                      </td>
                    ))}
                    {(canUpdate || canDelete) && (
                      <td className="px-5 py-3.5">
                        <div className="flex justify-end gap-1">
                          {canUpdate && (
                            <button
                              type="button"
                              onClick={() => openEdit(record)}
                              className="rounded-lg p-2 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600"
                              title={`Edit ${singular}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDelete(record)}
                              disabled={deletingId === record.id}
                              className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                              title={`Delete ${singular}`}
                            >
                              {deletingId === record.id ? (
                                <LoaderCircle className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showForm && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm"
        >
          <div ref={formPanelRef} role="dialog" aria-modal="true" className="content-scrollbar max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur">
              <div>
                <h2 className="text-lg font-bold text-slate-950">
                  {editingRecord ? `Edit ${singular}` : `New ${singular}`}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Fields marked with * are required.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                disabled={saving}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-5 p-6 sm:grid-cols-2">
              {fields.map((field) => {
                const options =
                  typeof field.options === 'function'
                    ? field.options(editingRecord, records)
                    : field.options || [];
                const fieldClass = field.span === 2 ? 'sm:col-span-2' : '';

                return (
                  <label key={field.name} className={fieldClass}>
                    <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                      {field.label}
                      {field.required ? ' *' : ''}
                    </span>

                    {field.type === 'image' ? (
                      <ImageInput
                        value={values[field.name] ?? ''}
                        onChange={(value) =>
                          setValues((current) => ({
                            ...current,
                            [field.name]: value,
                          }))
                        }
                      />
                    ) : field.type === 'textarea' ? (
                      <textarea
                        value={values[field.name] ?? ''}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            [field.name]: event.target.value,
                          }))
                        }
                        placeholder={field.placeholder}
                        required={field.required}
                        rows={4}
                        className="w-full resize-y rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      />
                    ) : field.type === 'mobile' ? (
                      <MobileInput
                        value={values[field.name] ?? ''}
                        onChange={(value) =>
                          setValues((current) => ({
                            ...current,
                            [field.name]: value,
                          }))
                        }
                        placeholder={field.placeholder}
                        required={field.required}
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      />
                    ) : field.type === 'select' ? (
                      <SearchSelect
                        value={values[field.name] ?? ''}
                        onChange={(value) =>
                          setValues((current) => ({
                            ...current,
                            [field.name]: value,
                          }))
                        }
                        options={options}
                        placeholder={field.placeholder || `Select ${field.label.toLowerCase()}`}
                        emptyOption={field.required ? undefined : field.placeholder || `Select ${field.label.toLowerCase()}`}
                        searchPlaceholder={`Search ${field.label.toLowerCase()}...`}
                        required={field.required}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      />
                    ) : (
                      <input
                        type={field.type || 'text'}
                        value={values[field.name] ?? ''}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            [field.name]: event.target.value,
                          }))
                        }
                        placeholder={field.placeholder}
                        required={field.required}
                        min={field.min}
                        max={field.max}
                        minLength={field.minLength}
                        maxLength={field.maxLength}
                        pattern={field.pattern}
                        title={field.patternTitle}
                        step={field.step}
                        className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                      />
                    )}

                    {field.help && (
                      <span className="mt-1.5 block text-xs leading-5 text-slate-500">
                        {field.help}
                      </span>
                    )}
                  </label>
                );
              })}

              <div className="flex justify-end gap-3 border-t border-slate-200 pt-5 sm:col-span-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  disabled={saving}
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
                >
                  {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
                  {editingRecord ? 'Save changes' : `Create ${singular.toLowerCase()}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const IMAGE_MAX_SIZE = 600;

/** Downscales the picked image in the browser and returns it as a data URL. */
function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('This file is not a supported image.'));
      image.onload = () => {
        const scale = Math.min(1, IMAGE_MAX_SIZE / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

function ImageInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-4 rounded-xl border border-dashed border-slate-300 p-3">
      <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-slate-50 ring-1 ring-slate-200">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="Logo preview" className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-xs text-slate-400">No logo</span>
        )}
      </div>
      <div className="space-y-2 text-sm">
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (!file) return;
            setError(null);
            try {
              onChange(await readImage(file));
            } catch (readError) {
              setError(readError instanceof Error ? readError.message : 'Could not read the image.');
            }
          }}
          className="block text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
        />
        {value && (
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              onChange('');
            }}
            className="text-xs font-semibold text-rose-600 hover:underline"
          >
            Remove logo
          </button>
        )}
        {error && <p className="text-xs text-rose-600">{error}</p>}
      </div>
    </div>
  );
}
