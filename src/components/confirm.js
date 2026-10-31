import { Alert, Platform } from 'react-native';
import { showToast } from './Toast';
import { sanitizeText } from '../utils/userMessages';

/**
 * Cross-platform confirm dialog. Works on iOS, Android AND web (Expo Web).
 *
 * Usage:
 *   confirm({ title: 'Delete', message: 'Are you sure?', confirmText: 'Yes', destructive: true })
 *     .then((ok) => { if (ok) doDelete(); });
 */
export function confirm({ title = 'Confirm', message = '', confirmText = 'OK', cancelText = 'Cancel', destructive = false } = {}) {
  return new Promise((resolve) => {
    if (Platform.OS === 'web') {
      if (typeof window === 'undefined') return resolve(false);
      const composed = message ? `${title}\n\n${message}` : title;
      resolve(window.confirm(composed));
      return;
    }
    Alert.alert(title, message, [
      { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
    ]);
  });
}

// Toast type from the wording when a caller doesn't say (most call sites
// predate types): failures → error, things to fix → warning, done → success.
const ERROR_RE = /\b(could ?n[o']t|couldn't|can ?not|can't|failed|failure|error|unable|invalid|incorrect|wrong|denied|expired|not (found|available|saved|allowed|sent|uploaded))\b/i;
const WARNING_RE = /\b(permission|required|missing|limit|warning|please (enter|select|choose|add|pick|fill|wait|check)|enter|select|choose|pick|too (many|long|short|large|big)|already|busy|offline|not ready|no (photo|image|item|items|employee|selection)s?\b)/i;
const SUCCESS_RE = /\b(success\w*|saved|created|updated|assigned|reassigned|accepted|rejected|started|ended|done|sent|uploaded|completed|submitted|added|removed|deleted|copied|verified|approved|cancelled|canceled|scheduled|rescheduled|shared|downloaded|logged (in|out)|checked (in|out)|marked|confirmed|requested|applied)\b/i;

function inferType(title, message, preset) {
  if (preset === 'done') return 'success';
  if (preset === 'error') return 'error';
  const text = `${title || ''} ${message || ''}`;
  if (ERROR_RE.test(text)) return 'error';
  if (WARNING_RE.test(text)) return 'warning';
  if (SUCCESS_RE.test(text)) return 'success';
  return 'info';
}

/**
 * App-wide toast (components/Toast). Signature stays (title, message) for
 * every existing call site; the optional third arg picks the type:
 *   notify('Task created', 'Assigned to Arun.', { type: 'success' })
 *   notify('Could not save', e.message)              // → error (inferred)
 *
 *   type:     'success' | 'error' | 'warning' | 'info'  (default: inferred)
 *   preset:   'done' | 'error'   (older call sites; same as type success / error)
 *   duration: seconds (default 3)
 * Text is passed through sanitizeText, so a raw technical error can't leak.
 */
export function notify(title, message = '', options = {}) {
  const { type, preset, duration = 3 } = options || {};
  const t = sanitizeText(String(title || ''));
  const m = message ? sanitizeText(String(message)) : '';
  showToast({ type: type || inferType(t, m, preset), title: t, message: m, duration: duration * 1000 });
}
