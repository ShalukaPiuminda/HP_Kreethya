'use client';

import { useCallback, useEffect, useState } from 'react';
import { LifeBuoy, LoaderCircle, Paperclip, Plus, RefreshCw, ShieldAlert, X } from 'lucide-react';
import {
  OperationActions,
  OperationField,
  OperationHeader,
  OperationModal,
  OperationNotice,
} from '@/components/operation-ui';
import { api, getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

interface HelpDeskRequest {
  id: number;
  title: string;
  task_type: string;
  priority: string;
  description: string | null;
  requester_name: string;
  status: 'Pending' | 'Accepted' | 'Rejected';
  progress: string;
  rejection_reason: string | null;
  task_number: number | null;
  attachments_count: number;
  created_at: string;
  reviewed_at: string | null;
  completed_at: string | null;
}

interface HelpDeskMeta {
  task_types: string[];
  priorities: string[];
}

const DEFAULT_META: HelpDeskMeta = {
  task_types: ['Error', 'Modification', 'New', 'Installation', 'Maintenance'],
  priorities: ['Normal', 'Urgent', 'Fire'],
};

const TYPE_HINTS: Record<string, string> = {
  Error: 'Something is not working correctly',
  Modification: 'Change how an existing feature works',
  New: 'A new feature or report',
  Installation: 'Install or set up the system / a device',
  Maintenance: 'Routine check, backup or clean-up',
};

const PRIORITY_HINTS: Record<string, string> = {
  Normal: 'Normal',
  Urgent: 'Urgent - affects daily work',
  Fire: 'Critical - business is stopped',
};

const ALLOWED_FILES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100';

const EMPTY_FORM = {
  title: '',
  task_type: '',
  priority: 'Normal',
  description: '',
  page_url: '',
  requester_phone: '',
};

function ProgressPill({ progress }: { progress: string }) {
  const classes =
    progress === 'Completed'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : progress === 'In Progress'
        ? 'bg-violet-50 text-violet-700 ring-violet-200'
        : progress === 'Accepted' || progress === 'Assigned'
          ? 'bg-indigo-50 text-indigo-700 ring-indigo-200'
          : progress === 'Pending Review'
            ? 'bg-amber-50 text-amber-700 ring-amber-200'
            : progress === 'Rejected'
              ? 'bg-rose-50 text-rose-700 ring-rose-200'
              : 'bg-slate-100 text-slate-600 ring-slate-200';

  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${classes}`}>
      {progress}
    </span>
  );
}

function PriorityPill({ priority }: { priority: string }) {
  const classes =
    priority === 'Fire'
      ? 'bg-rose-50 text-rose-700 ring-rose-200'
      : priority === 'Urgent'
        ? 'bg-amber-50 text-amber-700 ring-amber-200'
        : 'bg-slate-100 text-slate-600 ring-slate-200';

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${classes}`}>
      {priority}
    </span>
  );
}

const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString() : '-');

export default function HelpDeskPage() {
  const { hasPermission } = useAuth();
  const canView = hasPermission('help-desk', 'can_read');
  const canSubmit = hasPermission('help-desk', 'can_create');
  const [requests, setRequests] = useState<HelpDeskRequest[]>([]);
  const [meta, setMeta] = useState<HelpDeskMeta>(DEFAULT_META);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<HelpDeskRequest | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<HelpDeskRequest[]>('/v1/help-desk/requests');
      setRequests(res.data || []);
    } catch (error) {
      setNotice({ type: 'error', text: getApiErrorMessage(error, 'Could not load your requests.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!canView) return;
    const timer = window.setTimeout(() => {
      void load();
      api
        .get<HelpDeskMeta>('/v1/help-desk/meta')
        .then((res) => res.data && setMeta(res.data))
        .catch(() => undefined);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [canView, load]);

  function openForm() {
    setForm(EMPTY_FORM);
    setFiles([]);
    setFileError(null);
    setFormError(null);
    setShowForm(true);
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    setFileError(null);
    const next = [...files];
    for (const file of Array.from(list)) {
      if (!ALLOWED_FILES.includes(file.type)) {
        setFileError(`${file.name}: only images (JPG, PNG, GIF, WEBP) and PDF files are allowed.`);
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        setFileError(`${file.name} is larger than 10 MB.`);
        continue;
      }
      if (next.length >= MAX_FILES) {
        setFileError(`You can attach up to ${MAX_FILES} files.`);
        break;
      }
      next.push(file);
    }
    setFiles(next);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      const data = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (value.trim() !== '') data.append(key, value.trim());
      });
      files.forEach((file) => data.append('files[]', file));

      const res = await api.postForm<HelpDeskRequest>('/v1/help-desk/requests', data);
      setShowForm(false);
      setNotice({
        type: 'success',
        text: `Request #${res.data?.id ?? ''} sent. Our team will review it and you can follow its progress here.`,
      });
      await load();
    } catch (error) {
      setFormError(getApiErrorMessage(error, 'Could not send your request.'));
    } finally {
      setSaving(false);
    }
  }

  const set = (key: keyof typeof EMPTY_FORM, value: string) => setForm((current) => ({ ...current, [key]: value }));

  if (!canView) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-slate-500">
        <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-slate-300" />
        You don&apos;t have access to the Help Desk. Ask your administrator to enable it for your role.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <OperationHeader
        eyebrow="Support"
        title="Help Desk"
        description="Report a problem or request a change. Your request goes straight to our support team, and you can follow its progress here."
        icon={LifeBuoy}
        actions={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            {canSubmit && (
              <button
                type="button"
                onClick={openForm}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
              >
                <Plus className="h-4 w-4" /> New Request
              </button>
            )}
          </div>
        }
      />

      {notice && <OperationNotice type={notice.type}>{notice.text}</OperationNotice>}

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading && requests.length === 0 ? (
          <div className="flex items-center justify-center gap-2 p-16 text-sm text-slate-500">
            <LoaderCircle className="h-5 w-5 animate-spin" /> Loading your requests...
          </div>
        ) : requests.length === 0 ? (
          <div className="p-16 text-center">
            <LifeBuoy className="mx-auto mb-3 h-8 w-8 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">No requests yet</p>
            <p className="mt-1 text-sm text-slate-500">
              {canSubmit
                ? 'Click "New Request" to report a problem or ask for a change.'
                : 'Requests sent by your team will appear here.'}
            </p>
          </div>
        ) : (
          <>
            <table className="hidden w-full text-left text-sm md:table">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Request</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Requested by</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((r) => (
                  <tr key={r.id} onClick={() => setViewing(r)} className="cursor-pointer transition hover:bg-slate-50">
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{r.id}</td>
                    <td className="max-w-xs px-4 py-3">
                      <p className="truncate font-semibold text-slate-900">{r.title}</p>
                      {r.attachments_count > 0 && (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                          <Paperclip className="h-3 w-3" /> {r.attachments_count}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{r.task_type}</td>
                    <td className="px-4 py-3"><PriorityPill priority={r.priority} /></td>
                    <td className="px-4 py-3 text-slate-600">{r.requester_name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{formatDate(r.created_at)}</td>
                    <td className="px-4 py-3"><ProgressPill progress={r.progress} /></td>
                  </tr>
                ))}
              </tbody>
            </table>

            <ul className="divide-y divide-slate-100 md:hidden">
              {requests.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setViewing(r)} className="w-full space-y-2 p-4 text-left">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-slate-900">
                        <span className="mr-1 font-mono text-xs text-slate-400">#{r.id}</span> {r.title}
                      </p>
                      <ProgressPill progress={r.progress} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{r.task_type}</span>
                      <PriorityPill priority={r.priority} />
                      <span>{formatDate(r.created_at)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {showForm && (
        <OperationModal
          title="New Help Desk Request"
          description="Describe the problem or change clearly. Screenshots help us fix things faster."
          onClose={() => setShowForm(false)}
          width="max-w-2xl"
          icon={LifeBuoy}
        >
          <form onSubmit={submit} className="space-y-5 p-6">
            {formError && <OperationNotice type="error">{formError}</OperationNotice>}

            <div className="grid gap-4 sm:grid-cols-2">
              <OperationField label="Request type" required help={form.task_type ? TYPE_HINTS[form.task_type] : undefined}>
                <select className={inputClass} value={form.task_type} onChange={(e) => set('task_type', e.target.value)} required>
                  <option value="" disabled>Select type...</option>
                  {meta.task_types.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </OperationField>
              <OperationField label="Priority" required>
                <select className={inputClass} value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                  {meta.priorities.map((priority) => (
                    <option key={priority} value={priority}>{PRIORITY_HINTS[priority] ?? priority}</option>
                  ))}
                </select>
              </OperationField>
            </div>

            <OperationField label="Title" required>
              <input
                className={inputClass}
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                placeholder="e.g. Invoice total shows VAT twice"
                maxLength={255}
                required
              />
            </OperationField>

            <OperationField label="Description" required help="What happened, what you expected, and the steps to see it.">
              <textarea
                className={`${inputClass} min-h-32`}
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                maxLength={10000}
                required
              />
            </OperationField>

            <div className="grid gap-4 sm:grid-cols-2">
              <OperationField label="Screen / page" help="Where in the system, e.g. Sales > Invoices">
                <input className={inputClass} value={form.page_url} onChange={(e) => set('page_url', e.target.value)} maxLength={500} />
              </OperationField>
              <OperationField label="Contact phone" help="So we can call you if needed">
                <input className={inputClass} value={form.requester_phone} onChange={(e) => set('requester_phone', e.target.value)} maxLength={50} />
              </OperationField>
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-semibold text-slate-700">Attachments</span>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 transition hover:border-indigo-300 hover:bg-indigo-50/40">
                <Paperclip className="h-4 w-4" /> Add screenshots or PDFs (up to {MAX_FILES}, 10 MB each)
                <input
                  type="file"
                  multiple
                  accept={ALLOWED_FILES.join(',')}
                  className="sr-only"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
              {fileError && <p className="mt-1.5 text-xs text-rose-600">{fileError}</p>}
              {files.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {files.map((file, index) => (
                    <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                      <span className="truncate text-slate-700">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                        className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                        aria-label={`Remove ${file.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <OperationActions saving={saving} submitLabel="Send Request" onCancel={() => setShowForm(false)} />
          </form>
        </OperationModal>
      )}

      {viewing && (
        <OperationModal
          title={`#${viewing.id} ${viewing.title}`}
          description={`${viewing.task_type} - submitted ${formatDate(viewing.created_at)} by ${viewing.requester_name}`}
          onClose={() => setViewing(null)}
          width="max-w-2xl"
          icon={LifeBuoy}
        >
          <div className="space-y-5 p-6 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <ProgressPill progress={viewing.progress} />
              <PriorityPill priority={viewing.priority} />
              {viewing.task_number && (
                <span className="text-xs text-slate-500">Support ticket #{viewing.task_number}</span>
              )}
            </div>

            {viewing.status === 'Rejected' && viewing.rejection_reason && (
              <OperationNotice type="warning">Reason: {viewing.rejection_reason}</OperationNotice>
            )}

            <div>
              <p className="mb-1.5 text-xs font-semibold text-slate-700">Description</p>
              <p className="whitespace-pre-wrap leading-6 text-slate-600">{viewing.description}</p>
            </div>

            <dl className="grid gap-3 rounded-xl bg-slate-50 p-4 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-slate-500">Submitted</dt>
                <dd className="mt-0.5 font-semibold text-slate-800">{formatDate(viewing.created_at)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Reviewed</dt>
                <dd className="mt-0.5 font-semibold text-slate-800">{formatDate(viewing.reviewed_at)}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Completed</dt>
                <dd className="mt-0.5 font-semibold text-slate-800">{formatDate(viewing.completed_at)}</dd>
              </div>
            </dl>
          </div>
        </OperationModal>
      )}
    </div>
  );
}
