'use client';

import { useState } from 'react';
import { ShieldOff } from 'lucide-react';
import { api, getApiErrorMessage } from '@/lib/api';
import { OperationActions, OperationField, OperationModal, OperationNotice } from '@/components/operation-ui';

/** Restores a cancelled warranty; throws on failure so callers can show the message. */
export async function restoreWarranty(warrantyId: number): Promise<void> {
  await api.post(`/v1/warranty-claims/warranties/${warrantyId}/restore`, {});
}

/**
 * Asks for a reason and cancels a customer warranty (serial unit or invoice line).
 * Used by Serial Lookup, the claim detail and the service ticket workspace.
 */
export function CancelWarrantyDialog({
  warrantyId,
  description,
  isInvoiceLine = false,
  onClose,
  onCancelled,
}: {
  warrantyId: number;
  description: string;
  isInvoiceLine?: boolean;
  onClose: () => void;
  onCancelled: () => void | Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (reason.trim().length < 3) return;

    setSaving(true);
    setError(null);
    try {
      await api.post(`/v1/warranty-claims/warranties/${warrantyId}/cancel`, { reason: reason.trim() });
      await onCancelled();
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Unable to cancel the warranty.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <OperationModal
      title="Cancel Warranty"
      description={description}
      onClose={() => !saving && onClose()}
      width="max-w-lg"
      icon={ShieldOff}
    >
      <form onSubmit={submit} className="space-y-4 px-6 py-6">
        {error && <OperationNotice type="error">{error}</OperationNotice>}
        <OperationNotice type="warning">
          The customer will no longer be covered and new claims will show as out of warranty.
          {isInvoiceLine ? ' This cancels the warranty for the whole invoice line.' : ''} You can restore it later.
        </OperationNotice>
        <OperationField label="Reason" required>
          <textarea
            autoFocus
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Seal broken / physical damage / repaired by outside technician"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
          />
        </OperationField>
        <OperationActions
          saving={saving}
          disabled={reason.trim().length < 3}
          onCancel={onClose}
          submitLabel="Cancel Warranty"
        />
      </form>
    </OperationModal>
  );
}
