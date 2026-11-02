/*
 * Phone input patterns. Browsers compile `pattern` with the RegExp `v` flag, where
 * ( ) - must be escaped inside [...] or the whole pattern is rejected.
 */

/** Any phone number: digits, spaces, + ( ) -, 8 to 25 characters. */
export const PHONE_PATTERN = String.raw`[0-9+\(\)\-\s]{8,25}`;
export const PHONE_TITLE = 'Enter a valid phone number (at least 8 digits).';

/** Sri Lankan mobile: 07XXXXXXXX, 7XXXXXXXX, 947XXXXXXXX or +94 7X XXX XXXX. Needed for SMS. */
export const MOBILE_PATTERN = String.raw`(\+94|0094|94|0)?[\s\-]*7([\s\-]*[0-9]){8}`;
export const MOBILE_TITLE = 'Enter a valid Sri Lankan mobile number, e.g. 0771234567 or +94771234567.';
