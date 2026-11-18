// TPIN bridge between the API client and the TPIN bottom sheet (no imports →
// no require cycle). Routes mirror the server's app.security.tpin-routes; the
// path is relative to the service base (nginx strips /ticket, /order, …).
const ROUTES = [
  ['POST', /^\/technicians\/me\/attendance\/check-in$/, 'CHECK_IN'],
  ['POST', /^\/technicians\/me\/attendance\/check-out$/, 'CHECK_OUT'],
  ['POST', /^\/tickets\/?$/, 'REPAIR_BOOKING'],
  ['PATCH', /^\/tickets\/[^/]+\/status$/, 'TICKET_STATUS'],
  ['PATCH', /^\/technicians\/me\/pickup-bookings\/[^/]+\/status$/, 'PICKUP_DELIVERY'],
  ['POST', /^\/technicians\/me\/sell-pickups\/[^/]+\/payment$/, 'PAYMENT'],
  ['POST', /^\/repair-bookings\/[^/]+\/confirm-order$/, 'REPAIR_BOOKING'],
  ['POST', /^\/sell-orders\/shop-purchases\/[^/]+\/receive$/, 'PICKUP_DELIVERY'],
  ['POST', /^\/sell-orders\/shop-purchases\/[^/]+\/price\/confirm$/, 'SELL_CONFIRM'],
  ['POST', /^\/sell-orders\/shop-purchases\/[^/]+\/payout$/, 'PAYMENT'],
  ['POST', /^\/sell-orders\/shop-purchases\/[^/]+\/complete$/, 'SELL_CONFIRM'],
  ['POST', /^\/(shop|staff)\/buy-orders\/[^/]+\/[^/]+$/, 'BUY_ORDER'],
];

export const TPIN_HEADER = 'X-TPIN-Authorization';

export function matchTpinRoute(method, path) {
  const m = String(method || '').toUpperCase();
  const p = String(path || '').split('?')[0];
  const hit = ROUTES.find(([rm, re]) => rm === m && re.test(p));
  return hit ? hit[2] : null;
}

let handler = null;
/** Registered by the TPIN sheet only while a secure (device-bound) session is open. */
export function setTpinHandler(fn) { handler = fn; }
export function tpinActive() { return !!handler; }
/** Resolves to a one-time authorization token, rejects when cancelled. */
export function requestTpin(action, method, path) {
  if (!handler) return Promise.resolve(null);
  return handler({ action, method: String(method).toUpperCase(), path: String(path).split('?')[0] });
}
