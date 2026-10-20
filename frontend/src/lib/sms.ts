/**
 * Payment endpoints append the SMS result to their message
 * (e.g. "Installment payment recorded. SMS sent to customer.").
 * Returns just that SMS part, with a leading space, or ''.
 */
export function smsNote(message?: string | null): string {
  if (!message) return '';
  const index = message.indexOf(' SMS ');
  return index >= 0 ? message.slice(index) : '';
}
