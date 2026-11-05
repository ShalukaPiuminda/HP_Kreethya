/**
 * Sri Lankan NIC helpers. Mirrors App\Support\Nic on the backend.
 *
 * Old format: 9 digits + V or X   e.g. 901234567V  (YY DDD SSS C + letter)
 * New format: 12 digits           e.g. 199012304567 (YYYY DDD 0SSS C)
 * DDD is the day of the year of birth (001-366), plus 500 for females.
 *
 * Format checks prove the number is well formed. They cannot prove it was
 * issued, or that it belongs to this person - that is what the confirmation
 * step is for.
 */

export const NIC_PATTERN = '[0-9]{9}[VvXx]|[0-9]{12}';
export const NIC_PATTERN_TITLE = 'Enter 9 digits followed by V or X (e.g. 901234567V), or 12 digits (e.g. 199012304567).';

export interface NicDetails {
  nic: string;
  format: 'old' | 'new';
  birthYear: number;
  gender: 'Male' | 'Female';
  birthday: string;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function normalizeNic(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, '').toUpperCase();
}

export function parseNic(value: string | null | undefined): NicDetails | null {
  const nic = normalizeNic(value);
  let birthYear: number;
  let dayCode: number;
  let format: 'old' | 'new';

  if (/^\d{9}[VX]$/.test(nic)) {
    format = 'old';
    birthYear = 1900 + Number(nic.slice(0, 2));
    dayCode = Number(nic.slice(2, 5));
  } else if (/^\d{12}$/.test(nic)) {
    format = 'new';
    birthYear = Number(nic.slice(0, 4));
    dayCode = Number(nic.slice(4, 7));
    if (birthYear < 1900 || birthYear > new Date().getFullYear()) return null;
  } else {
    return null;
  }

  const female = dayCode > 500;
  const dayOfYear = female ? dayCode - 500 : dayCode;
  if (dayOfYear < 1 || dayOfYear > 366) return null;

  // NIC day numbers always count February as 29 days.
  const monthLengths = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let remaining = dayOfYear;
  let month = 0;
  while (remaining > monthLengths[month]) {
    remaining -= monthLengths[month];
    month += 1;
  }

  return {
    nic,
    format,
    birthYear,
    gender: female ? 'Female' : 'Male',
    birthday: `${remaining} ${MONTHS[month]}`,
  };
}

/** Error message for an invalid NIC, or null when it is valid. */
export function nicError(value: string | null | undefined): string | null {
  const nic = normalizeNic(value);
  if (nic === '') return 'NIC is required.';
  if (!/^(\d{9}[VX]|\d{12})$/.test(nic)) return NIC_PATTERN_TITLE;
  if (!parseNic(nic)) return `NIC ${nic} is not valid: the birth year or day number in it is out of range.`;
  return null;
}

/**
 * Validate-and-confirm hooks for a CrudWorkspace form with an `NIC` field.
 * An edit that leaves the NIC unchanged is neither re-validated nor confirmed,
 * so records created before this rule can still have other details edited.
 */
export function nicFormHooks<TRecord extends { NIC?: unknown }>(
  options: { updatesLinkedRecords?: boolean } = {},
) {
  const unchanged = (payload: Record<string, unknown>, editing: TRecord | null) =>
    editing !== null && normalizeNic(String(editing.NIC ?? '')) === normalizeNic(String(payload.NIC ?? ''));

  return {
    preparePayload: (payload: Record<string, unknown>) => ({
      ...payload,
      NIC: normalizeNic(String(payload.NIC ?? '')),
    }),
    validateSubmit: (payload: Record<string, unknown>, editing: TRecord | null) =>
      unchanged(payload, editing) ? null : nicError(String(payload.NIC ?? '')),
    confirmSubmit: (payload: Record<string, unknown>, editing: TRecord | null) =>
      unchanged(payload, editing)
        ? null
        : nicConfirmMessage(String(payload.NIC ?? ''), editing ? String(editing.NIC ?? '') : null, options),
  };
}

/** Message asking the user to double-check the NIC before saving. */
export function nicConfirmMessage(
  value: string,
  previous?: string | null,
  options: { updatesLinkedRecords?: boolean } = {},
): string {
  const details = parseNic(value);
  const nic = normalizeNic(value);
  const lines = previous && normalizeNic(previous) !== nic
    ? [`Change NIC from ${normalizeNic(previous)} to ${nic}?`]
    : [`Please confirm this NIC is correct: ${nic}`];

  if (details) {
    lines.push(
      '',
      `Format: ${details.format === 'old' ? 'Old (9 digits + letter)' : 'New (12 digits)'}`,
      `Born: ${details.birthday} ${details.birthYear}`,
      `Gender: ${details.gender}`,
      '',
      'Check these against the NIC card before saving.',
    );
  }

  if (options.updatesLinkedRecords && previous && normalizeNic(previous) !== nic) {
    lines.push('', 'Their existing invoices, HP agreements, payments and advances will be updated to the new NIC.');
  }

  return lines.join('\n');
}
