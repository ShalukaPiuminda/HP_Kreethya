'use client';

import { LoaderCircle, Printer } from 'lucide-react';
import { OperationModal } from '@/components/operation-ui';

/**
 * Asked after the print dialog closes: the browser can't tell whether the
 * labels really came out, so lines are only marked printed when the user says so.
 */
export function PrintConfirmDialog({
  labelCount,
  saving,
  error,
  onConfirm,
  onCancel,
}: {
  labelCount: number;
  saving: boolean;
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <OperationModal
      title="Did the labels print OK?"
      description={`${labelCount} label${labelCount === 1 ? '' : 's'} were sent to the printer.`}
      onClose={onCancel}
      width="max-w-md"
      icon={Printer}
    >
      <div className="space-y-4 px-6 py-5 text-sm text-slate-600">
        <p>Choose <strong>Yes</strong> to mark these GRN lines as printed. Choose <strong>No</strong> if the print failed or was cancelled; nothing is saved.</p>
        {error && <div className="rounded-xl bg-rose-50 px-3 py-2 text-rose-700">{error}</div>}
        <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-xl px-4 py-2.5 font-semibold text-slate-600 transition hover:bg-slate-100 disabled:opacity-50"
          >
            No, not printed
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            autoFocus
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 font-semibold text-white transition hover:bg-emerald-700 disabled:bg-slate-300"
          >
            {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
            Yes, mark printed
          </button>
        </div>
      </div>
    </OperationModal>
  );
}
