import { authApi } from './client';

// Employee PIN (auth-service /auth/me/pin*). Server only: the server ties the
// salted hash to the JWT's user id, so only the caller's own PIN is ever
// checked, created or reset. No phone-side PIN — when the service can't answer,
// nothing is saved and the employee sees PIN_UNAVAILABLE.
export const PIN_UNAVAILABLE = 'PIN security service temporarily unavailable. Please try again.';

const unavailable = (e) => !e?.status || [404, 405].includes(e.status) || e.status >= 500 || (e.status === 403 && !e.serverMessage);
const wrap = (p) => p.catch((e) => {
  if (unavailable(e)) throw Object.assign(new Error(PIN_UNAVAILABLE), { status: e?.status, userFacing: true, payload: { message: PIN_UNAVAILABLE }, cause: e });
  throw e;
});

const COMMON = ['123456', '654321', '000000', '111111', '121212', '123123', '112233', '123321', '696969', '666666', '159753', '147258', '789456', '102030', '202020', '101010'];
/** Same rules as the server (EmployeePinService.weakReason) — early feedback only. */
export function weakReason(pin) {
  if (!/^\d{6}$/.test(String(pin || ''))) return 'PIN must be exactly 6 digits.';
  if (new Set(pin).size === 1) return 'PIN is too easy. Avoid repeated digits.';
  let up = true; let down = true;
  for (let i = 1; i < 6; i += 1) { const d = pin.charCodeAt(i) - pin.charCodeAt(i - 1); if (d !== 1) up = false; if (d !== -1) down = false; }
  if (up || down || COMMON.includes(pin)) return 'PIN is too easy to guess. Choose another.';
  return null;
}
const checkWeak = (pin) => { const w = weakReason(pin); if (w) throw Object.assign(new Error(w), { status: 400, userFacing: true, payload: { message: w } }); };

// App unlock / PIN prompts use the SAME owner-set Login MPIN (auth-service
// /auth/security, lockout shared with login). Legacy /auth/me/pin is no longer used.
export const getPinStatus = () => wrap(authApi.get('/auth/security/pin', { skipAuthExpiry: true }))
  .then((s) => ({ ...s, pinSet: !!s?.mpinSet }));
export const verifyPin = (pin) => wrap(authApi.post('/auth/security/mpin/verify', { body: { pin }, skipAuthExpiry: true }))
  .catch((e) => {
    const m = String(e?.serverMessage || '');
    const left = m.match(/WRONG_PIN:(\d+)/);
    const msg = left ? `Incorrect MPIN. ${left[1]} attempt(s) left.` : /PIN_LOCKED/.test(m) ? 'Too many wrong attempts. Try again in 15 minutes.' : null;
    if (msg) throw Object.assign(new Error(msg), { status: e.status, userFacing: true, payload: { message: msg }, cause: e });
    throw e;
  });
/**
 * Employee changes their own Login MPIN (auth-service PUT /auth/employee/change-mpin).
 * The server identifies the employee from the session, verifies the current MPIN
 * (shared 5-try lockout) and revokes all sessions — the caller must log out.
 */
export async function changeLoginMpin(currentMpin, newMpin) {
  try {
    return await authApi.put('/auth/employee/change-mpin', { body: { currentMpin, newMpin } });
  } catch (e) {
    const m = String(e?.serverMessage || '');
    const left = m.match(/WRONG_PIN:(\d+)/);
    const msg = left ? `Current MPIN is incorrect. ${left[1]} attempt(s) left.`
      : /PIN_LOCKED/.test(m) ? 'Too many wrong attempts. Try again in 15 minutes.'
        : /different/i.test(m) ? 'New MPIN must be different from your current MPIN.'
          : /too simple/i.test(m) ? 'MPIN is too simple. Avoid repeated or sequential digits.'
            : /6 digits/i.test(m) ? 'MPIN must be exactly 6 digits.'
              : null;
    if (msg) throw Object.assign(new Error(msg), { status: e.status, userFacing: true, payload: { message: msg }, cause: e });
    throw e;
  }
}

export const savePin = async (pin, currentPin) => { checkWeak(pin); return wrap(authApi.put('/auth/me/pin', { body: { pin, currentPin } })); };
/** Forgot PIN: OTP from /auth/otp/send for the employee's own mobile / email. */
export const resetPin = async (identifier, otp, pin) => { checkWeak(pin); return wrap(authApi.post('/auth/me/pin/reset', { body: { identifier, otp, pin } })); };
