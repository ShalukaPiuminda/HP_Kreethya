'use client';

import { useRef } from 'react';
import { CornerDownLeft, ScanLine } from 'lucide-react';
import { normalizeBarcode } from '@/lib/barcode';

/**
 * Dedicated field for USB/Bluetooth (keyboard-type) barcode scanners.
 * The scanner types the code and ends with Enter or Tab: that suffix is swallowed here,
 * so it never submits the surrounding form or moves focus, and the field clears itself
 * ready for the next scan. A typed code can also be applied with the Add button.
 * Each scan is reported once through `onScan`.
 */
export function ScanInput({
  onScan,
  placeholder = 'Scan barcode or type code + Enter',
  disabled = false,
  className = '',
}: {
  onScan: (code: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function submit(): boolean {
    const input = inputRef.current;
    if (!input) return false;

    const code = normalizeBarcode(input.value);
    if (!code) return false;

    input.value = '';
    input.focus();
    onScan(code);
    return true;
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' && event.key !== 'Tab') return;
    if (event.nativeEvent.isComposing) return;

    // Empty Tab keeps normal keyboard navigation; Enter never submits the form.
    if (event.key === 'Tab' && !normalizeBarcode(event.currentTarget.value)) return;

    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;

    submit();
  }

  return (
    <div className={`relative ${className}`}>
      <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-500" />
      <input
        ref={inputRef}
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="done"
        aria-label="Scan barcode"
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        className="h-9 w-full rounded-xl border border-indigo-200 bg-white py-2 pl-9 pr-16 font-mono text-xs text-slate-900 outline-none transition placeholder:font-sans placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:cursor-not-allowed disabled:bg-slate-100"
      />
      <button
        type="button"
        onClick={submit}
        disabled={disabled}
        title="Add the scanned or typed code (same as Enter)"
        className="absolute right-1 top-1/2 inline-flex h-7 -translate-y-1/2 items-center gap-1 rounded-lg bg-indigo-50 px-2 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <CornerDownLeft className="h-3.5 w-3.5" />
        Add
      </button>
    </div>
  );
}
