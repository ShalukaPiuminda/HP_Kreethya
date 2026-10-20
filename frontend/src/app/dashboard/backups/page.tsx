'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Archive,
  Database,
  Download,
  HardDriveDownload,
  LoaderCircle,
  RefreshCcw,
} from 'lucide-react';
import {
  OperationActions,
  OperationHeader,
  OperationMetric,
  OperationModal,
  OperationNotice,
} from '@/components/operation-ui';
import { api, getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

type BackupMode = 'continue' | 'refresh';

type BackupEntry = {
  id: string;
  filename: string;
  mode: BackupMode;
  created_at: string;
  created_by: {
    id: number;
    username: string;
    email: string;
    branch: string;
  };
  download_url: string;
  size_bytes: number;
  size_label: string;
  totals: {
    tables: number;
    rows: number;
  };
  refresh_summary?: {
    tables_cleared: number;
    rows_cleared: number;
    details: Array<{
      table: string;
      rows: number;
    }>;
  } | null;
  preserves: string[];
};

export default function BackupsPage() {
  const { isSuperAdmin, loading: authLoading } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [runningMode, setRunningMode] = useState<BackupMode | null>(null);
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [notice, setNotice] = useState<{
    type: 'success' | 'error' | 'warning';
    text: string;
    details?: string[];
  } | null>(null);
  const [refreshConfirmOpen, setRefreshConfirmOpen] = useState(false);
  const [refreshArmed, setRefreshArmed] = useState(false);

  const loadBackups = useCallback(async () => {
    try {
      const response = await api.get<BackupEntry[]>('/v1/system/backups');
      setBackups(response.data || []);
    } catch (error) {
      setNotice({
        type: 'error',
        text: getApiErrorMessage(error, 'Unable to load backup history.'),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (authLoading) return;
      if (!isSuperAdmin) {
        setLoading(false);
        router.replace('/dashboard');
        return;
      }

      void loadBackups();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [authLoading, isSuperAdmin, loadBackups, router]);

  const latestBackup = backups[0] || null;
  const totalRowsBackedUp = useMemo(
    () => backups.reduce((sum, backup) => sum + backup.totals.rows, 0),
    [backups]
  );

  async function createBackup(mode: BackupMode) {
    setRunningMode(mode);
    setNotice(null);

    try {
      const response = await api.post<BackupEntry>('/v1/system/backups', { mode });
      const created = response.data;

      if (created) {
        setBackups((current) => [created, ...current.filter((entry) => entry.id !== created.id)]);
      }

      setNotice({
        type: mode === 'refresh' ? 'warning' : 'success',
        text:
          mode === 'refresh'
            ? 'Backup created and operational records were refreshed.'
            : 'Backup created successfully. Live data stays untouched.',
        details:
          mode === 'refresh' && created?.refresh_summary?.details?.length
            ? created.refresh_summary.details
                .slice(0, 8)
                .map((detail) => `${detail.table}: ${detail.rows.toLocaleString()} rows`)
            : undefined,
      });
    } catch (error) {
      setNotice({
        type: 'error',
        text: getApiErrorMessage(error, 'Unable to create backup.'),
      });
    } finally {
      setRunningMode(null);
      setRefreshConfirmOpen(false);
      setRefreshArmed(false);
    }
  }

  async function downloadBackup(backup: BackupEntry) {
    try {
      await api.download(backup.download_url, backup.filename);
    } catch (error) {
      setNotice({
        type: 'error',
        text: getApiErrorMessage(error, 'Unable to download the backup ZIP.'),
      });
    }
  }

  return (
    <div className="space-y-6">
      <OperationHeader
        eyebrow="Administration"
        title="Backups & Refresh"
        description="Create dated ZIP backups with CSV exports for each ERP data area, then optionally refresh only operational transactions while preserving your master setup."
        icon={HardDriveDownload}
      />

      {notice && (
        <OperationNotice
          type={notice.type}
          details={notice.details}
        >
          {notice.text}
        </OperationNotice>
      )}

      <section className="grid gap-4 xl:grid-cols-4">
        <OperationMetric
          label="Backup history"
          value={String(backups.length)}
          help="Saved ZIP snapshots"
          tone="indigo"
        />
        <OperationMetric
          label="Rows archived"
          value={totalRowsBackedUp.toLocaleString()}
          help="Across saved backups"
        />
        <OperationMetric
          label="Latest snapshot"
          value={latestBackup ? formatDateTime(latestBackup.created_at) : 'None yet'}
          help={latestBackup ? latestBackup.mode : 'Create the first backup'}
          tone="emerald"
        />
        <OperationMetric
          label="Preserved on refresh"
          value="Users · Items · Masters"
          help="Operational transactions only are cleared"
          tone="amber"
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ActionCard
          title="Backup and continue"
          description="Create a full ZIP backup with grouped CSV files, then keep working with the same live data."
          accent="indigo"
          icon={Archive}
          points={[
            'Exports each ERP area into dated CSV files inside one ZIP archive.',
            'Keeps invoices, HP agreements, payments, stock, and ledger data live.',
            'Best before releases, data imports, or major accounting changes.',
          ]}
          action={
            <button
              type="button"
              onClick={() => void createBackup('continue')}
              disabled={runningMode !== null}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {runningMode === 'continue' ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
              Backup and continue
            </button>
          }
        />

        <ActionCard
          title="Backup and refresh"
          description="Create the same ZIP backup first, then clear only operational transactions so the branch can start a fresh period with the same setup."
          accent="amber"
          icon={RefreshCcw}
          points={[
            'Preserves users, roles, items, categories, customers, suppliers, and chart of accounts.',
            'Clears operational entries like purchases, sales, HP, service, stock movements, cheques, vouchers, and ledgers.',
            'Resets customer advance balances to zero after the refresh.',
          ]}
          action={
            <button
              type="button"
              onClick={() => setRefreshConfirmOpen(true)}
              disabled={runningMode !== null}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {runningMode === 'refresh' ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4" />
              )}
              Backup and refresh
            </button>
          }
        />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Backup history</h2>
            <p className="mt-1 text-sm text-slate-500">
              Download earlier snapshots any time. Every file name already carries its timestamp.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-6 py-4">Created</th>
                <th className="px-6 py-4">Mode</th>
                <th className="px-6 py-4">Rows</th>
                <th className="px-6 py-4">Size</th>
                <th className="px-6 py-4">Created by</th>
                <th className="px-6 py-4">Refresh result</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-slate-400">
                    <LoaderCircle className="mx-auto mb-2 h-5 w-5 animate-spin text-indigo-600" />
                    Loading backup history...
                  </td>
                </tr>
              ) : backups.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center text-slate-400">
                    No backups yet. Create the first one above.
                  </td>
                </tr>
              ) : (
                backups.map((backup) => (
                  <tr key={backup.id} className="border-t border-slate-100 align-top">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-900">
                        {formatDateTime(backup.created_at)}
                      </div>
                      <div className="font-mono text-xs text-slate-500">
                        {backup.filename}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <ModePill mode={backup.mode} />
                    </td>
                    <td className="px-6 py-4 text-slate-700">
                      <div>{backup.totals.rows.toLocaleString()} rows</div>
                      <div className="text-xs text-slate-500">
                        {backup.totals.tables} tables
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-700">{backup.size_label}</td>
                    <td className="px-6 py-4 text-slate-700">
                      <div className="font-medium">{backup.created_by.username}</div>
                      <div className="text-xs text-slate-500">
                        {backup.created_by.branch} · {backup.created_by.email}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-700">
                      {backup.refresh_summary ? (
                        <>
                          <div className="font-medium text-amber-700">
                            {backup.refresh_summary.rows_cleared.toLocaleString()} rows cleared
                          </div>
                          <div className="text-xs text-slate-500">
                            {backup.refresh_summary.tables_cleared} transaction tables reset
                          </div>
                        </>
                      ) : (
                        <span className="text-slate-400">No refresh</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => void downloadBackup(backup)}
                        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                      >
                        <Download className="h-4 w-4" />
                        Download ZIP
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {refreshConfirmOpen && (
        <OperationModal
          title="Confirm backup and refresh"
          description="We will create the ZIP first, then clear only operational data."
          onClose={() => {
            if (runningMode) return;
            setRefreshConfirmOpen(false);
            setRefreshArmed(false);
          }}
          width="max-w-2xl"
        >
          <form
            className="space-y-5 p-6"
            onSubmit={(event) => {
              event.preventDefault();
              if (!refreshArmed || runningMode) return;
              void createBackup('refresh');
            }}
          >
            <OperationNotice
              type="warning"
              details={[
                'Users, roles, categories, items, customers, suppliers, and accounts stay in place.',
                'Purchases, sales, hire purchase, service, stock movements, cheques, vouchers, bank entries, and ledger transactions are cleared.',
                'Customer advance balances are reset to zero after the refresh.',
              ]}
            >
              This action is designed for a fresh operating cycle without rebuilding master data.
            </OperationNotice>

            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={refreshArmed}
                onChange={(event) => setRefreshArmed(event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-amber-500 focus:ring-amber-500"
              />
              <span>
                I understand that operational transactions will be cleared after the backup ZIP is created.
              </span>
            </label>

            <OperationActions
              saving={runningMode === 'refresh'}
              submitLabel="Create backup and refresh"
              onCancel={() => {
                if (runningMode) return;
                setRefreshConfirmOpen(false);
                setRefreshArmed(false);
              }}
              disabled={!refreshArmed}
            />
          </form>
        </OperationModal>
      )}
    </div>
  );
}

function ActionCard({
  title,
  description,
  points,
  accent,
  icon: Icon,
  action,
}: {
  title: string;
  description: string;
  points: string[];
  accent: 'indigo' | 'amber';
  icon: typeof Database;
  action: React.ReactNode;
}) {
  const styles =
    accent === 'amber'
      ? 'border-amber-200 bg-amber-50/70'
      : 'border-indigo-200 bg-indigo-50/70';
  const iconStyles =
    accent === 'amber'
      ? 'bg-amber-100 text-amber-700 ring-amber-200'
      : 'bg-indigo-100 text-indigo-700 ring-indigo-200';

  return (
    <section className={`rounded-3xl border p-6 shadow-sm ${styles}`}>
      <div className="flex items-start gap-4">
        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1 ring-inset ${iconStyles}`}>
          <Icon className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
          <ul className="mt-4 space-y-2 text-sm text-slate-700">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-2">
                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <div className="mt-5">{action}</div>
        </div>
      </div>
    </section>
  );
}

function ModePill({ mode }: { mode: BackupMode }) {
  const styles =
    mode === 'refresh'
      ? 'bg-amber-50 text-amber-700 ring-amber-200'
      : 'bg-indigo-50 text-indigo-700 ring-indigo-200';

  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ring-inset ${styles}`}>
      {mode}
    </span>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
