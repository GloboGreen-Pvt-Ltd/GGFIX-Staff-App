// Indian mobile normalisation — identical to the Partner (owner) app's
// src/utils/mobile.js, so the number the owner saves for an employee and the
// number the employee types at login always reduce to the same 10 digits.
//
//   +91 98765 43210 → 9876543210
//   919876543210    → 9876543210
//   09876543210     → 9876543210
//   9876543210      → 9876543210
//
// Returns '' for empty input, null when it isn't a valid 10-digit number.
export function normalizeIndianMobile(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (/[^\d\s()+\-.]/.test(raw)) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return digits.length === 10 ? digits : null;
}
