// Fresh authentication before a sensitive action (cash payment, completing a
// pickup / delivery, security settings). The employee's own biometric (if they
// enabled it) or their server-checked PIN. Throws when not confirmed, so an
// API wrapper can simply `await requireFreshAuth(...)` before the call.
import { getPinStatus } from '../api/pin';
import { getLockPrefs, hasBiometrics, authenticate, isDeviceSecure } from './appLock';
import { openPinPrompt } from '../components/PinPad';
import { tpinActive, matchTpinRoute } from '../security/tpinBridge';

const cancelled = (msg) => Object.assign(new Error(msg), { userFacing: true, payload: { message: msg } });

export async function requireFreshAuth(title = 'Confirm it’s you', { method, path, body } = {}) {
  // TPIN-protected request: the API client asks TPIN once for it (tpinBridge),
  // so no second prompt here. Everything else (App Lock, biometrics) keeps MPIN / device auth.
  if (tpinActive() && method && path && matchTpinRoute(method, path, body)) return true;
  let status = null;
  try { status = await getPinStatus(); } catch (_) { status = null; }
  const prefs = await getLockPrefs();
  const bio = prefs.biometric && (await hasBiometrics());
  if (status?.pinSet) {
    if (await openPinPrompt({ title, biometric: bio })) return true;
    throw cancelled('Confirmation cancelled.');
  }
  // PIN service unreachable (or not deployed yet): the phone's own lock confirms
  // the holder; the action itself is still authorised by the server via the JWT.
  // No employee PIN yet: the phone's own lock, when it has one. A phone without
  // any lock keeps today's flow (prompt to create a PIN in My Account).
  if (await authenticate()) return true;
  if (!(await isDeviceSecure())) return true;
  throw cancelled('Confirmation cancelled.');
}
