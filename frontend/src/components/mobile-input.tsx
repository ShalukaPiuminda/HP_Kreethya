'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export const MOBILE_LENGTH = 10;

/** Keep digits only and convert 94XXXXXXXXX / 7XXXXXXXX to the local 07XXXXXXXX form. */
export function toLocalMobile(value: string | null | undefined): string {
  let digits = String(value ?? '').replace(/\D+/g, '');
  if (digits.startsWith('0094')) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('94')) digits = `0${digits.slice(2)}`;
  if (digits.length === 9 && digits.startsWith('7')) digits = `0${digits}`;
  return digits.slice(0, MOBILE_LENGTH);
}

/** Returns an error message, or '' when the number is empty or valid. */
export function mobileError(value: string): string {
  if (!value) return '';
  if (!value.startsWith('0')) return 'Mobile number must start with 0 (e.g. 0771234567).';
  if (value.length > 1 && value[1] !== '7') return 'Mobile number must start with 07.';
  if (value.length < MOBILE_LENGTH) return `Enter ${MOBILE_LENGTH} digits (${MOBILE_LENGTH - value.length} more).`;
  return '';
}

/**
 * Sri Lankan mobile number input: numbers only, max 10 digits, validated while typing.
 * Blocks form submission (via setCustomValidity) until the number is valid.
 */
export function MobileInput({
  value,
  onChange,
  required = false,
  className = '',
  placeholder = '07XXXXXXXX',
  id,
}: {
  value: string | null | undefined;
  onChange: (value: string) => void;
  required?: boolean;
  className?: string;
  placeholder?: string;
  id?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [touched, setTouched] = useState(false);
  const current = toLocalMobile(value);
  const error = mobileError(current);
  const valid = current.length === MOBILE_LENGTH && !error;

  useEffect(() => {
    inputRef.current?.setCustomValidity(error);
  }, [error]);

  // Show "too short" only after the user leaves the field; wrong prefix shows immediately.
  const showError = !!error && (touched || !error.startsWith('Enter'));
  const tone = showError
    ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100'
    : valid
      ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-100'
      : '';

  return (
    <div>
      <div className="relative">
        <input
          ref={inputRef}
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          maxLength={MOBILE_LENGTH}
          value={current}
          required={required}
          placeholder={placeholder}
          aria-invalid={showError}
          onChange={(event) => onChange(event.target.value.replace(/\D+/g, '').slice(0, MOBILE_LENGTH))}
          onBlur={() => setTouched(true)}
          className={`${className} pr-16 ${tone}`}
        />
        <span
          className={`pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold tabular-nums ${
            valid ? 'text-emerald-600' : showError ? 'text-rose-500' : 'text-slate-400'
          }`}
        >
          {current.length}/{MOBILE_LENGTH}
        </span>
      </div>
      {showError ? (
        <span className="mt-1.5 flex items-center gap-1 text-xs text-rose-600">
          <AlertCircle className="h-3.5 w-3.5" /> {error}
        </span>
      ) : valid ? (
        <span className="mt-1.5 flex items-center gap-1 text-xs text-emerald-600">
          <CheckCircle2 className="h-3.5 w-3.5" /> Valid mobile number
        </span>
      ) : null}
    </div>
  );
}
