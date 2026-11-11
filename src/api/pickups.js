import { ticketApi } from './client';
import { store } from '../store';
import { selectTechnicianId } from '../store/authSlice';
import { awaitingAccept } from '../utils/pickups';

function unwrap(list) {
  return Array.isArray(list) ? list : (list?.content ?? list?.data ?? []);
}

// Bookings currently assigned to the calling pickup person. Backed by
// ticket-service's PickupBookingController#listMyPickupBookings
// (GET /technicians/me/pickup-bookings?status=…).
//
// Lives on ticket-service (not order-service) because the employee JWT is
// already accepted there. Ticket-service JDBC-queries the shared Postgres
// repair_bookings table directly — no cross-service routing needed. Caller's
// userId + shopId from the JWT identify which pickup person to filter by.
//
// skipAuthExpiry: defensive — a 401 here MUST NOT kick the user back to
// Login. Same precedent as getTodayAttendance and getRepairBooking.
// Device purchases (the shop buying a customer's device) assigned to me for
// pickup: ticket-service SellPickupController, same row shape plus kind 'SELL'.
// Older servers don't have it — then there are none.
const sellIds = new Set();
const isSell = (id) => sellIds.has(String(id));
const base = (id) => (isSell(id) ? '/technicians/me/sell-pickups' : '/technicians/me/pickup-bookings');
async function listSellPickups() {
  try {
    return unwrap(await ticketApi.get('/technicians/me/sell-pickups', { skipAuthExpiry: true }));
  } catch (_) {
    return [];
  }
}

export async function listMyAssignedPickups(status) {
  const [repairs, sells] = await Promise.all([
    ticketApi.get('/technicians/me/pickup-bookings', { query: status ? { status } : undefined, skipAuthExpiry: true }).then(unwrap),
    status ? Promise.resolve([]) : listSellPickups(),
  ]);
  sells.forEach((b) => sellIds.add(String(b.id)));
  const rows = [...repairs, ...sells.map((b) => ({ ...b, kind: 'SELL' }))];
  // Second guard on top of the server scope (same as My Jobs): drop a booking
  // now assigned to another pickup person (assignedPickupPersonId is the
  // technicians.id the server filters by). Passes through until
  // /technicians/me has loaded, and for rows without the field.
  const me = selectTechnicianId(store.getState());
  const mine = rows.filter((b) => !me || !b?.assignedPickupPersonId || String(b.assignedPickupPersonId) === String(me));
  // Not accepted yet → assignment preview only, for every screen, reminder
  // and the scanner (they all read this list). The server returns the full
  // row; the rest arrives once the pickup is accepted (started).
  // The server joins address parts that can repeat ("…, Tamil Nadu, Tamil
  // Nadu"); every screen (and Directions) gets the cleaned text.
  return mine.map((b) => (awaitingAccept(b) ? previewOf(b)
    : b?.pickupAddressText ? { ...b, pickupAddressText: cleanAddress(b.pickupAddressText) } : b));
}

// What an employee may see of a pickup before accepting it: the assignment
// itself (ID, schedule, status, assignee, events for "reassigned") and the
// device's catalogue image (brand / model ids + model image) so the card shows
// the device. Customer, contact, address, customer photos and prices are left out.
const PREVIEW_FIELDS = [
  'id', 'bookingNumber', 'shopId', 'serviceMode', 'status', 'pickupDate', 'pickupSlotStart', 'pickupSlotEnd',
  'assignedPickupPersonId', 'pickupPersonName', 'createdAt', 'updatedAt', 'events', 'accepted', 'acceptedAt',
  'brandId', 'modelId', 'deviceImageUrl', 'modelImageUrl', 'deviceImageBase64', 'modelImageBase64',
];
function previewOf(b) {
  const out = { preview: true };
  PREVIEW_FIELDS.forEach((k) => { if (b?.[k] !== undefined) out[k] = b[k]; });
  return out;
}

// Drop repeated comma-separated parts (case / spacing insensitive), keeping order.
// The server appends locality / city / state / pincode to the address line,
// which often already holds them ("…, Tamil Nadu 607001" + ", Tamil Nadu,
// 607001"), so a part also spelled out inside a longer part is dropped too.
export function cleanAddress(text) {
  const parts = String(text).split(',').map((p) => p.trim()).filter(Boolean);
  const keys = parts.map((p) => p.toLowerCase().replace(/\s+/g, ' '));
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const seen = new Set();
  return parts.filter((p, i) => {
    const k = keys[i];
    if (seen.has(k)) return false;
    const inside = new RegExp(`(^|[^a-z0-9])${esc(k)}([^a-z0-9]|$)`);
    if (keys.some((o, j) => j !== i && o.length > k.length && inside.test(o))) return false;
    seen.add(k);
    return true;
  }).join(', ');
}

// Accept an assignment (ticket-service PickupBookingController#acceptPickup).
// Records acceptance only; the journey starts with a separate
// PICKUP_ON_THE_WAY. Idempotent on the server (repeat → alreadyAccepted).
export async function acceptPickup(bookingId) {
  return ticketApi.post(`${base(bookingId)}/${bookingId}/accept`, { skipAuthExpiry: true });
}

// Decline an assignment with a reason: the booking goes back to the shop to
// reassign (not cancelled for the customer). Only before the journey starts.
export async function declinePickup(bookingId, { reason, note } = {}) {
  return ticketApi.post(`${base(bookingId)}/${bookingId}/decline`, {
    body: { reason, note: note || undefined },
    skipAuthExpiry: true,
  });
}

// Advance a pickup booking one step. Backend validates the transition order
// (PICKUP_PERSON_ASSIGNED → PICKUP_ON_THE_WAY → PICKED_UP → REACHED_SHOP →
// RECEIVED_AT_SHOP). `nextStatus` must be one of those canonical keys (or
// CANCELLED).
//
// `opts.latitude` / `opts.longitude` are required for REACHED_SHOP — the
// backend enforces a 50m radius around the shop's stored coordinates and
// returns 422 with `code: 'OUT_OF_RADIUS' | 'LOCATION_REQUIRED' |
// 'SHOP_LOCATION_MISSING'` plus a `distanceMeters` if the check fails.
// Callers should display the `message` field verbatim.
// `opts.inspection` (device purchase, Device Collected): the pickup person's
// re-check from the sell inspection pages, saved beside the customer's answers.
export async function updatePickupStatus(bookingId, nextStatus, opts) {
  const { note, latitude, longitude, inspection } = opts || {};
  return await ticketApi.patch(`${base(bookingId)}/${bookingId}/status`, {
    body: {
      status: nextStatus,
      ...(note ? { note } : {}),
      ...(latitude != null ? { latitude } : {}),
      ...(longitude != null ? { longitude } : {}),
      ...(inspection ? { inspection } : {}),
    },
  });
}

// Device purchase: what the customer answered when selling (device ids,
// screening, conditions, issues, accessories, warranty) — pre-fills the
// pickup person's inspection. SellPickupController GET …/{id}/evaluation.
export async function getSellEvaluation(bookingId) {
  return await ticketApi.get(`/technicians/me/sell-pickups/${bookingId}/evaluation`, { skipAuthExpiry: true });
}

// Device purchase, at the customer's door (SellPickupController): pickup OTP →
// inspection → revised price (shop owner, then the customer) → payment → Device
// Collected. Each returns the updated pickup row.
const sellStep = (id, step, body) => ticketApi.post(`/technicians/me/sell-pickups/${id}/${step}`, body ? { body } : undefined);
export const sendSellOtp = (id) => sellStep(id, 'otp/send');
export const verifySellOtp = (id, otp) => sellStep(id, 'otp/verify', { otp });
export const saveSellInspection = (id, inspection) => sellStep(id, 'inspection', { inspection });
/** First opening of the inspection — the shop sees "Inspection Started" (idempotent on the server). */
export const startSellInspection = (id) => sellStep(id, 'inspection/start');
export const submitSellRevision = (id, { amount, reason, note }) => sellStep(id, 'revision', { amount, reason, note });
/** decision AGREE | DECLINE — the customer's answer to the owner-approved price. */
export const sellCustomerDecision = (id, decision) => sellStep(id, 'revision/customer', { decision });
/** method UPI | CASH; proofUrl from uploadMedia. */
export const recordSellPayment = (id, { method, reference, proofUrl }) => sellStep(id, 'payment', { method, reference, proofUrl });

export async function getPickupRepairEstimate(bookingId) {
  if (isSell(bookingId)) return null; // a purchase has no repair estimate
  return await ticketApi.get(`/technicians/me/pickup-bookings/${bookingId}/repair-estimate`, {
    skipAuthExpiry: true,
  });
}

export async function updatePickupRepairEstimateImages(bookingId, payload) {
  return await ticketApi.patch(`/technicians/me/pickup-bookings/${bookingId}/repair-estimate/images`, {
    body: payload,
  });
}

export async function submitPickupRepairEstimate(bookingId, payload) {
  return await ticketApi.post(`/technicians/me/pickup-bookings/${bookingId}/repair-estimate`, {
    body: payload,
  });
}
