// User-facing error text. The API clients turn every failed request into one
// of these short, safe messages (err.message); the raw server text stays on
// err.serverMessage / err.diagnostic for logic and developer logs only.
// notify() runs everything through sanitizeText as a second guard, so no URL,
// endpoint, status code, stack trace or token ever reaches the screen.

export const MSG = {
  unavailable: 'This feature is currently unavailable.',
  server: 'Something went wrong. Please try again.',
  network: 'No internet connection.',
  timeout: 'Connection timed out. Please try again.',
  session: 'Session expired. Please log in again.',
  forbidden: "You don't have permission.",
  save: 'Unable to save. Please try again.',
  sync: 'Unable to sync. Please retry.',
  credentials: 'Invalid login credentials',
  tooLarge: 'File is too large.',
  tooMany: 'Too many attempts. Please wait and try again.',
};

// Leaks: never shown, whoever wrote the text.
const LEAKS = [
  /https?:\/\/|www\.|\b[\w-]+\.(in|com|io|net|org|dev|app|local)\b(?!\s+[a-z])/i, // URLs / domains
  /(^|[\s(])\/[\w.-]+\/[\w./-]*/, // endpoint paths
  /[{}<>\\`]|\[\w*\]/, // JSON / markup / code
  /\bHTTP\s*\d{3}\b|\bstatus (code )?\d{3}\b|\(\d{3}\)/i, // status codes
  /\b\w*(Exception|Error):|\bat [\w$.<>]+ ?\(|\bstack ?trace\b/, // exceptions / stack frames
  /\b(org|com|java|javax|android|io|kotlin)\.[a-z]\w*\./, // class names
  /\b(jdbc|hibernate|postgres\w*|sql\w*|duplicate key|violates|constraint|relation ")\b/i, // database
  /\b(bearer|jwt|access[_ ]?token|refresh[_ ]?token)\b/i, // tokens
  /\bnetwork request failed|failed to fetch|no static resource|no handler found\b/i, // transport internals
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, // UUIDs
];

// Server text is shown only when it reads like a plain sentence, so on top of
// the leaks: no field names (camelCase / snake_case), no programmer words.
const SERVER_STRICT = [
  /\b[a-z]+[A-Z][a-z]\w*\b/, // camelCase field names (startAt) — "iPhone" style brand words aside
  /\b[a-z]+_[a-z_]+\b/, // snake_case
  /\b(null|undefined|NaN|must not be|cannot be null|exception|request|parameter|header|payload|internal|unknown enum)\b/i,
];

const hasLeak = (t) => LEAKS.some((re) => re.test(t));

/** Server text that is fine to show as is (short plain sentence, no internals). */
export function isSafeText(s) {
  if (typeof s !== 'string') return false;
  const t = s.trim();
  if (t.length < 2 || t.length > 140 || /\n/.test(t)) return false;
  return !hasLeak(t) && !SERVER_STRICT.some((re) => re.test(t.replace(/\bi(Phone|Pad|Mac|OS|Cloud)\b/g, 'Apple')));
}

/** Best guess at what a raw (unsafe) error string was about. */
function classify(raw) {
  const s = String(raw || '');
  if (/timed? ?out|timeout/i.test(s)) return MSG.timeout;
  if (/network|internet|offline|failed to fetch|ECONN|ENOTFOUND|EAI_AGAIN|unreachable/i.test(s)) return MSG.network;
  if (/session|expired|unauthori[sz]ed|\b401\b|jwt|token/i.test(s)) return MSG.session;
  if (/forbidden|\b403\b|access denied/i.test(s)) return MSG.forbidden;
  if (/\b404\b|no static resource|no handler/i.test(s)) return MSG.unavailable;
  if (/\b413\b|too large/i.test(s)) return MSG.tooLarge;
  return null;
}

/**
 * Display guard (used by notify): the text itself unless it leaks internals,
 * otherwise the matching friendly message (or `fallback`).
 */
export function sanitizeText(s, fallback = MSG.server) {
  if (s == null || s === '') return s;
  const str = String(s);
  if (!hasLeak(str) && str.length <= 300) return str;
  return classify(str) || fallback;
}

/**
 * The message an API client puts on err.message for a failed response.
 * Safe validation text from the server (e.g. "Invalid OTP") is kept for
 * 400 / 401-at-login / 409 / 422; everything else maps to a fixed friendly message.
 */
export function friendlyApiMessage({ status, serverMessage, method = 'GET', hadToken = true, sessionExpired = false }) {
  if (sessionExpired) return MSG.session;
  const write = String(method).toUpperCase() !== 'GET';
  const safe = isSafeText(serverMessage) ? serverMessage.trim() : null;
  if (status === 401) return hadToken ? MSG.session : (safe || MSG.credentials);
  if (status === 403) return MSG.forbidden;
  if (status === 404) return MSG.unavailable;
  if (status === 408 || status === 504 || status === 524) return MSG.timeout;
  if (status === 413) return MSG.tooLarge;
  if (status === 429) return MSG.tooMany;
  if (status >= 500) return MSG.server;
  return safe || (write ? MSG.save : MSG.sync);
}

/** Network-level failure (no response): offline or timed out. */
export const transportMessage = (timedOut) => (timedOut ? MSG.timeout : MSG.network);

/** For screens: the safe message of any thrown error. */
export function userMessage(err, fallback = MSG.server) {
  if (!err) return fallback;
  if (err.status === 0) return transportMessage(err.timeout);
  // Not from an API client (device / runtime error, e.g. a TypeError or a
  // native module rejection): shown only when it reads like a plain sentence.
  if (err.status == null && !isSafeText(err.message)) return fallback;
  return sanitizeText(err.message, fallback) || fallback;
}

/** Developer-only log of what really happened (method + path; no host, no token). */
export function logDiagnostic(err) {
  // eslint-disable-next-line no-undef
  if (typeof __DEV__ !== 'undefined' && __DEV__ && err?.diagnostic) console.warn('[api]', err.diagnostic);
}
