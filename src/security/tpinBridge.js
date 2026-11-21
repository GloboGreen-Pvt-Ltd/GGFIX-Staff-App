// TPIN bridge between the API client and the TPIN bottom sheet (no imports →
// no require cycle). Routes mirror the server's app.security.tpin-routes; the
// path is relative to the service base (nginx strips /ticket, /order, …).
// The 4th item (optional) narrows a route to the critical action only:
// routine steps (accept, start journey, start delivery, …) go without TPIN.
// The action type stays the server's own type for that route, so its
// TpinInterceptor consumes the token for exactly this request.
const stat = (o) => String(o?.body?.status || o?.query?.status || '').toUpperCase();
const ROUTES = [
  ['POST', /^\/technicians\/me\/attendance\/check-in$/, 'CHECK_IN'],
  ['POST', /^\/technicians\/me\/attendance\/check-out$/, 'CHECK_OUT'],
  ['POST', /^\/tickets\/?$/, 'REPAIR_BOOKING'],
  // Repair ticket: only cancellation.
  ['PATCH', /^\/tickets\/[^/]+\/status$/, 'TICKET_STATUS', (o) => stat(o) === 'CANCELLED'],
  // Repair pickup: only the device handover at the shop.
  ['PATCH', /^\/technicians\/me\/pickup-bookings\/[^/]+\/status$/, 'PICKUP_DELIVERY', (o) => stat(o) === 'RECEIVED_AT_SHOP'],
  ['POST', /^\/technicians\/me\/sell-pickups\/[^/]+\/payment$/, 'PAYMENT'],
  // Repair return: only the final delivery.
  ['POST', /^\/technicians\/me\/repair-deliveries\/[^/]+\/complete$/, 'PICKUP_DELIVERY'],
  ['POST', /^\/repair-bookings\/[^/]+\/confirm-order$/, 'REPAIR_BOOKING'],
  ['POST', /^\/sell-orders\/shop-purchases\/[^/]+\/receive$/, 'PICKUP_DELIVERY'],
  ['POST', /^\/sell-orders\/shop-purchases\/[^/]+\/price\/confirm$/, 'SELL_CONFIRM'],
  ['POST', /^\/sell-orders\/shop-purchases\/[^/]+\/payout$/, 'PAYMENT'],
  ['POST', /^\/sell-orders\/shop-purchases\/[^/]+\/complete$/, 'SELL_CONFIRM'],
  ['POST', /^\/shop\/buy-orders\/[^/]+\/[^/]+$/, 'BUY_ORDER'],
  // Marketplace: only "picked up at shop" and the final delivery.
  ['POST', /^\/staff\/buy-orders\/[^/]+\/(pickup|deliver)$/, 'BUY_ORDER'],
];
// Server routes the app no longer prompts for up front. If the server still
// enforces TPIN there (403 TPIN_REQUIRED), the client asks once and retries.
const SERVER_ROUTES = [
  ['PATCH', /^\/tickets\/[^/]+\/status$/, 'TICKET_STATUS'],
  ['PATCH', /^\/technicians\/me\/pickup-bookings\/[^/]+\/status$/, 'PICKUP_DELIVERY'],
  ['POST', /^\/staff\/buy-orders\/[^/]+\/[^/]+$/, 'BUY_ORDER'],
];

export const TPIN_HEADER = 'X-TPIN-Authorization';

export function matchTpinRoute(method, path, opts) {
  const m = String(method || '').toUpperCase();
  const p = String(path || '').split('?')[0];
  const hit = ROUTES.find(([rm, re, , when]) => rm === m && re.test(p) && (!when || when(opts)));
  return hit ? hit[2] : null;
}
/** Server TPIN action for a route the app skipped (used only after 403 TPIN_REQUIRED). */
export function serverTpinRoute(method, path) {
  const m = String(method || '').toUpperCase();
  const p = String(path || '').split('?')[0];
  const hit = SERVER_ROUTES.find(([rm, re]) => rm === m && re.test(p));
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
