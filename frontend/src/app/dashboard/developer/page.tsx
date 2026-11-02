'use client';

import { useCallback, useEffect, useState } from 'react';
import { KeyRound, LoaderCircle, MessageSquareText, Send, ShieldAlert } from 'lucide-react';
import { OperationField, OperationHeader, OperationNotice } from '@/components/operation-ui';
import { FEATURE_INFO } from '@/components/feature-gate';
import { api, getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import type { FeatureKey } from '@/lib/auth-types';

interface FeatureRow {
  key: FeatureKey;
  label: string;
  enabled: boolean;
  enabled_at: string | null;
  enabled_by: string | null;
}

type TemplateKey = 'payment' | 'invoice_payment' | 'advance' | 'arrears' | 'reminder';

interface SmsSettings {
  company_name: string;
  send_payment: boolean;
  send_arrears: boolean;
  send_reminder: boolean;
  reminder_days_before: number;
  arrears_repeat_days: number;
  templates: Record<TemplateKey, string>;
}

const TEMPLATE_LABELS: Record<TemplateKey, { label: string; help: string }> = {
  payment: { label: 'HP payment received', help: 'Installment, down payment and pay-at-once. Sent immediately.' },
  invoice_payment: { label: 'Invoice payment received', help: 'Customer payments against sales invoices. Sent immediately.' },
  advance: { label: 'Advance received', help: 'Customer advance payments. Sent immediately.' },
  arrears: { label: 'Arrears (overdue)', help: 'Daily job + manual "Send reminder" button.' },
  reminder: { label: 'Due-date reminder', help: 'Sent the set number of days before an installment is due.' },
};

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100';

export default function DeveloperPage() {
  const { isDeveloper, refreshFeatures } = useAuth();
  const [features, setFeatures] = useState<FeatureRow[]>([]);
  const [settings, setSettings] = useState<SmsSettings | null>(null);
  const [placeholders, setPlaceholders] = useState<string[]>([]);
  const [gatewayConfigured, setGatewayConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('Test message from the HP ERP system.');
  const [testing, setTesting] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [featureRes, smsRes] = await Promise.all([
        api.get<FeatureRow[]>('/v1/developer/features'),
        api.get<{ settings: SmsSettings; placeholders: string[]; gateway_configured: boolean }>('/v1/developer/sms-settings'),
      ]);
      setFeatures(featureRes.data || []);
      if (smsRes.data) {
        setSettings(smsRes.data.settings);
        setPlaceholders(smsRes.data.placeholders);
        setGatewayConfigured(smsRes.data.gateway_configured);
      }
    } catch (error) {
      setNotice({ type: 'error', text: getApiErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isDeveloper) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [isDeveloper, load]);

  async function toggleFeature(feature: FeatureRow) {
    setToggling(feature.key);
    try {
      const res = await api.put(`/v1/developer/features/${feature.key}`, { enabled: !feature.enabled });
      setNotice({ type: 'success', text: res.message || 'Feature updated.' });
      await Promise.all([load(), refreshFeatures()]);
    } catch (error) {
      setNotice({ type: 'error', text: getApiErrorMessage(error) });
    } finally {
      setToggling(null);
    }
  }

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const res = await api.put<SmsSettings>('/v1/developer/sms-settings', { ...settings });
      if (res.data) setSettings(res.data);
      setNotice({ type: 'success', text: 'SMS settings saved.' });
    } catch (error) {
      setNotice({ type: 'error', text: getApiErrorMessage(error) });
    } finally {
      setSaving(false);
    }
  }

  async function sendTest(event: React.FormEvent) {
    event.preventDefault();
    setTesting(true);
    try {
      const res = await api.post('/v1/developer/sms-test', { phone: testPhone, message: testMessage });
      setNotice({ type: 'success', text: res.message || 'Test SMS sent.' });
    } catch (error) {
      setNotice({ type: 'error', text: getApiErrorMessage(error) });
    } finally {
      setTesting(false);
    }
  }

  if (!isDeveloper) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-16 text-center text-slate-500">
        <ShieldAlert className="mx-auto mb-3 h-8 w-8 text-slate-300" />
        This page is only available to the developer account.
      </div>
    );
  }

  const update = <K extends keyof SmsSettings>(key: K, value: SmsSettings[K]) =>
    setSettings((current) => (current ? { ...current, [key]: value } : current));

  return (
    <div className="space-y-6">
      <OperationHeader
        eyebrow="Developer"
        title="Feature Control"
        description="Enable the paid features this client has bought. Client users (including Super Admin) see locked features but cannot use them until you enable them here."
        icon={KeyRound}
      />

      {notice && <OperationNotice type={notice.type}>{notice.text}</OperationNotice>}

      <section className="grid gap-4 md:grid-cols-2">
        {loading && features.length === 0 ? (
          <div className="col-span-full flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white p-10 text-sm text-slate-400">
            <LoaderCircle className="h-4 w-4 animate-spin" /> Loading features...
          </div>
        ) : (
          features.map((feature) => (
            <div key={feature.key} className="flex items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="min-w-0">
                <h2 className="font-bold text-slate-950">{feature.label}</h2>
                <p className="mt-1 text-sm text-slate-500">{FEATURE_INFO[feature.key]?.description}</p>
                <p className="mt-2 text-xs text-slate-400">
                  {feature.enabled
                    ? `Enabled${feature.enabled_by ? ` by ${feature.enabled_by}` : ''}${feature.enabled_at ? ` on ${new Date(feature.enabled_at).toLocaleString()}` : ''}`
                    : 'Locked for this system'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={feature.enabled}
                aria-label={`Enable ${feature.label}`}
                disabled={toggling === feature.key}
                onClick={() => void toggleFeature(feature)}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
                  feature.enabled ? 'bg-emerald-500' : 'bg-slate-300'
                }`}
              >
                <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${feature.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
          ))
        )}
      </section>

      {settings && (
        <form onSubmit={saveSettings} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-5 w-5 text-indigo-600" />
            <h2 className="text-lg font-bold text-slate-950">SMS settings</h2>
          </div>

          {!gatewayConfigured && (
            <OperationNotice type="warning">
              Notify.lk credentials are missing. Set NOTIFYLK_USER_ID, NOTIFYLK_API_KEY and NOTIFYLK_SENDER_ID in the backend .env.
            </OperationNotice>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <OperationField label="Company name in SMS" help="Leave blank to use the company record name.">
              <input className={inputClass} maxLength={60} value={settings.company_name} onChange={(e) => update('company_name', e.target.value)} />
            </OperationField>
            <OperationField label="Reminder: days before due date">
              <input type="number" min={1} max={30} className={inputClass} value={settings.reminder_days_before} onChange={(e) => update('reminder_days_before', Number(e.target.value))} />
            </OperationField>
            <OperationField label="Arrears: repeat every (days)" help="Automatic arrears SMS is sent at most once in this period.">
              <input type="number" min={1} max={60} className={inputClass} value={settings.arrears_repeat_days} onChange={(e) => update('arrears_repeat_days', Number(e.target.value))} />
            </OperationField>
          </div>

          <div className="flex flex-wrap gap-5 text-sm font-medium text-slate-700">
            {([
              ['send_payment', 'Payment receipts'],
              ['send_arrears', 'Automatic arrears SMS'],
              ['send_reminder', 'Due-date reminders'],
            ] as const).map(([key, label]) => (
              <label key={key} className="inline-flex items-center gap-2">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={settings[key]} onChange={(e) => update(key, e.target.checked)} />
                {label}
              </label>
            ))}
          </div>

          <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <span className="font-semibold">Placeholders:</span> {placeholders.join('  ')}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {(Object.keys(TEMPLATE_LABELS) as TemplateKey[]).map((key) => (
              <OperationField key={key} label={TEMPLATE_LABELS[key].label} help={`${TEMPLATE_LABELS[key].help} ${settings.templates[key]?.length ?? 0} characters.`}>
                <textarea
                  rows={3}
                  maxLength={480}
                  className={inputClass}
                  value={settings.templates[key] ?? ''}
                  onChange={(e) => update('templates', { ...settings.templates, [key]: e.target.value })}
                />
              </OperationField>
            ))}
          </div>

          <div className="flex justify-end border-t border-slate-200 pt-5">
            <button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:bg-slate-300">
              {saving && <LoaderCircle className="h-4 w-4 animate-spin" />}
              {saving ? 'Saving...' : 'Save SMS settings'}
            </button>
          </div>
        </form>
      )}

      <form onSubmit={sendTest} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:grid-cols-[1fr_2fr_auto] md:items-end">
        <OperationField label="Test phone number" required>
          <input className={inputClass} placeholder="07XXXXXXXX" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} required />
        </OperationField>
        <OperationField label="Message" required>
          <input className={inputClass} maxLength={480} value={testMessage} onChange={(e) => setTestMessage(e.target.value)} required />
        </OperationField>
        <button type="submit" disabled={testing} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-300">
          {testing ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send test SMS
        </button>
      </form>
    </div>
  );
}
