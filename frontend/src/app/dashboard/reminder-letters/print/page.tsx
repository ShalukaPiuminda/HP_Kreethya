'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, LoaderCircle, Printer } from 'lucide-react';
import { Letterhead, type LetterheadParty } from '@/components/letterhead';
import { OperationNotice } from '@/components/operation-ui';
import { api, getApiErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { type LetterStage, type RenderedLetter, STAGE_LABELS } from '@/lib/reminder-letters';

type RenderResponse = {
  letters: RenderedLetter[];
  skipped: string[];
  company: LetterheadParty;
  branch: LetterheadParty;
};

export default function ReminderLetterPrintPage() {
  return (
    <Suspense fallback={null}>
      <ReminderLetterPrint />
    </Suspense>
  );
}

function ReminderLetterPrint() {
  const searchParams = useSearchParams();
  const { hasPermission } = useAuth();
  const stage = Number(searchParams.get('stage')) as LetterStage;
  const invoiceNos = (searchParams.get('ids') || '').split(',').filter(Boolean);
  const idsKey = invoiceNos.join(',');
  const [data, setData] = useState<RenderResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printed, setPrinted] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        const response = await api.post<RenderResponse>('/v1/reminder-letters/render', {
          invoice_nos: idsKey.split(','),
          stage,
        });
        setData(response.data || null);
      } catch (loadError) {
        setError(getApiErrorMessage(loadError));
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [idsKey, stage]);

  async function recordPrinted() {
    setRecording(true);
    try {
      const agreements = Array.from(new Set(data?.letters.map((letter) => letter.invoice_no) || []));
      const response = await api.post<{ advanced: number; skipped: string[] }>('/v1/reminder-letters/mark-printed', {
        invoice_nos: agreements,
        stage,
      });
      setRecorded(response.message || 'Recorded as printed.');
    } catch (recordError) {
      setError(getApiErrorMessage(recordError));
    } finally {
      setRecording(false);
    }
  }

  function print() {
    window.print();
    setPrinted(true);
  }

  if (!STAGE_LABELS[stage] || invoiceNos.length === 0) {
    return <div className="rounded-xl bg-rose-50 p-5 text-rose-700">Choose letters to print from the Reminder Letters page.</div>;
  }
  if (error && !data) return <div className="rounded-xl bg-rose-50 p-5 text-rose-700">{error}</div>;
  if (!data) return <div className="p-12 text-center text-slate-400">Preparing letters...</div>;

  const canRecord = hasPermission('reminder-letters', 'can_create');
  const company = data.company;
  const branch = data.branch;

  return (
    <div className="mx-auto max-w-4xl">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          :root { --print-margin: 15mm; }
          .letter-page { display: block; margin: 0 !important; break-inside: avoid; }
          .letter-page + .letter-page { break-before: page; page-break-before: always; }
        }
      `}</style>

      <div className="mb-5 space-y-3 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/dashboard/reminder-letters" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600"><ArrowLeft className="h-4 w-4" /> Reminder letters</Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-500">{STAGE_LABELS[stage]} · {data.letters.length} page{data.letters.length === 1 ? '' : 's'}</span>
            <button onClick={print} disabled={data.letters.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white disabled:bg-slate-300"><Printer className="h-4 w-4" /> Print / Save PDF</button>
          </div>
        </div>
        {error && <OperationNotice type="error">{error}</OperationNotice>}
        {data.skipped.length > 0 && (
          <OperationNotice type="warning" details={data.skipped}>
            {data.skipped.length} agreement(s) skipped because they are no longer in arrears.
          </OperationNotice>
        )}
        {recorded ? (
          <OperationNotice type="success">{recorded}</OperationNotice>
        ) : canRecord && data.letters.length > 0 && (
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${printed ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-slate-200 bg-white text-slate-600'}`}>
            <span>
              {printed
                ? 'Did the letters print correctly? Record them so each customer moves to the next stage.'
                : 'After printing, record the letters so each customer moves to the next stage. Viewing this page alone changes nothing.'}
            </span>
            <button onClick={() => void recordPrinted()} disabled={recording} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {recording ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Record as printed
            </button>
          </div>
        )}
      </div>

      <div className="space-y-6 print:space-y-0">
        {data.letters.map((letter, index) => (
          <article key={`${letter.invoice_no}-${letter.recipient_type}-${letter.recipient_code}-${index}`} className="letter-page min-h-[1050px] bg-white p-12 text-slate-950 shadow-sm ring-1 ring-slate-200 print:min-h-0 print:p-0 print:shadow-none print:ring-0">
            <Letterhead company={company} branch={branch} />

            <div className="mt-8 flex items-start justify-between gap-6 text-sm">
              <div>
                <div className="font-semibold">{letter.recipient_name}</div>
                <div className="max-w-xs whitespace-pre-line">{letter.recipient_address}</div>
                <div className="mt-4">{letter.date}</div>
              </div>
              {letter.recipient_type === 'guarantor' && (
                <div className="shrink-0 border-2 border-slate-900 px-3 py-1 text-xs font-bold uppercase tracking-widest">Guarantor Copy</div>
              )}
            </div>

            <h1 className="mt-8 text-center text-base font-bold uppercase underline">{letter.title}</h1>
            <div className="mt-6 whitespace-pre-wrap text-[15px] leading-7">{letter.body}</div>
          </article>
        ))}
      </div>
    </div>
  );
}
