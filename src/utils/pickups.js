// Pickup bookings — shared display rules (statuses, next step, buckets, dates,
// failed-pickup reasons). Pure helpers so My Pickups, the calendar, details
// and history all read a booking the same way. Status VALUES are the
// backend's (PickupBookingController.PICKUP_FLOW); only labels live here.

import { SHOP_BOOKING_STATUS_OPTIONS } from '../screens/common/serviceHistoryPhases';

const pad2 = (n) => String(n).padStart(2, '0');
const up = (v) => String(v || '').toUpperCase();

// The pickup person's flow, in order. Each step lists the backend codes that
// mean "at this step" (legacy aliases included). The backend has no separate
// Accept step: an assigned pickup is accepted by starting it (On the Way).
export const PICKUP_STEPS = [
  { key: 'ASSIGNED', label: 'Assigned', codes: ['PICKUP_PERSON_ASSIGNED', 'PICKUP_ASSIGNED', 'PICKUP_REASSIGNED'] },
  { key: 'ON_THE_WAY', label: 'On the Way', codes: ['PICKUP_ON_THE_WAY'] },
  { key: 'AT_CUSTOMER', label: 'Reached Customer', codes: ['REACHED_CUSTOMER_LOCATION'] },
  { key: 'ESTIMATE', label: 'Estimate & Verification', codes: ['REPAIR_ESTIMATE_PROCESSING', 'ESTIMATE_SUBMITTED'] },
  { key: 'COLLECTED', label: 'Device Collected', codes: ['DEVICE_PICKED_UP', 'PICKED_UP'] },
  { key: 'REACHED_SHOP', label: 'Reached Shop', codes: ['REACHED_SHOP'] },
  { key: 'HANDED_OVER', label: 'Handed Over to Shop', codes: ['RECEIVED_AT_SHOP'] },
];
/** Index in PICKUP_STEPS, -1 for anything else (e.g. CANCELLED). */
export const stepIndex = (status) => PICKUP_STEPS.findIndex((s) => s.codes.includes(up(status)));
// After RECEIVED_AT_SHOP the booking carries the shop's repair statuses
// (SERVICE phase in screens/common/serviceHistoryPhases: IN_REPAIR, READY,
// INVOICE_GENERATED, DELIVERED_PROCESSING, DELIVERED …). The pickup leg is
// over by then, so for the pickup person they read as Handed Over / Completed.
const PRE_PICKUP = new Set(['', 'PICKUP_BOOKING_CREATED']);
export const isPastPickup = (status) => {
  const s = up(status);
  return stepIndex(s) === -1 && s !== 'CANCELLED' && !PRE_PICKUP.has(s);
};

const META = {
  PICKUP_PERSON_ASSIGNED: { label: 'Assigned', color: '#035C6C' },
  PICKUP_ASSIGNED: { label: 'Assigned', color: '#035C6C' },
  PICKUP_REASSIGNED: { label: 'Re-Assigned', color: '#FAA700' },
  PICKUP_ON_THE_WAY: { label: 'On the Way', color: '#0788C9' },
  REACHED_CUSTOMER_LOCATION: { label: 'At Customer', color: '#1C3053' },
  REPAIR_ESTIMATE_PROCESSING: { label: 'Estimate Submitted', color: '#FAA700' },
  ESTIMATE_SUBMITTED: { label: 'Estimate Submitted', color: '#FAA700' },
  DEVICE_PICKED_UP: { label: 'Device Collected', color: '#609138' },
  PICKED_UP: { label: 'Device Collected', color: '#609138' },
  REACHED_SHOP: { label: 'Reached Shop', color: '#1C3053' },
  RECEIVED_AT_SHOP: { label: 'Handed Over', color: '#609138' },
  CANCELLED: { label: 'Cancelled', color: '#F32C26' },
};
/** { label, color, bg } for a status pill. */
export function statusMeta(status) {
  const m = META[up(status)] || (isPastPickup(status) ? META.RECEIVED_AT_SHOP
    : { label: up(status).replace(/_/g, ' ') || '—', color: '#6B7280' });
  return { ...m, bg: `${m.color}1A` };
}

// Still in the pickup person's hands. REACHED_SHOP stays active so "Received
// at Shop" can be tapped on the same card; RECEIVED_AT_SHOP is terminal.
export const ACTIVE_PICKUP_STATUSES = new Set([
  'PICKUP_PERSON_ASSIGNED', 'PICKUP_ASSIGNED', 'PICKUP_REASSIGNED',
  'PICKUP_ON_THE_WAY', 'REACHED_CUSTOMER_LOCATION',
  'REPAIR_ESTIMATE_PROCESSING', 'ESTIMATE_SUBMITTED',
  'DEVICE_PICKED_UP', 'PICKED_UP',
  'REACHED_SHOP',
]);
export const isActive = (b) => ACTIVE_PICKUP_STATUSES.has(up(b?.status));

/** Summary bucket: ASSIGNED | IN_PROGRESS | COMPLETED | CANCELLED | OTHER. */
export function bucketOf(status) {
  const i = stepIndex(status);
  if (up(status) === 'CANCELLED') return 'CANCELLED';
  if (i === 0) return 'ASSIGNED';
  if (i === PICKUP_STEPS.length - 1 || isPastPickup(status)) return 'COMPLETED';
  if (i > 0) return 'IN_PROGRESS';
  return 'OTHER';
}

// Current status → the one step the pickup person taps next (null = none).
// `action` tells the caller what the step needs: 'reachedCustomer' / 'reached'
// send GPS (50 m gates on the server), 'estimate' opens the estimate wizard.
export function nextStatusFor(currentStatus) {
  const s = up(currentStatus);
  if (s === 'PICKUP_PERSON_ASSIGNED' || s === 'PICKUP_ASSIGNED' || s === 'PICKUP_REASSIGNED') {
    return { code: 'PICKUP_ON_THE_WAY', label: "I'm On The Way" };
  }
  if (s === 'PICKUP_ON_THE_WAY') {
    return { code: 'REACHED_CUSTOMER_LOCATION', label: 'Reached Customer Location', action: 'reachedCustomer' };
  }
  if (s === 'REACHED_CUSTOMER_LOCATION') {
    return { code: 'REPAIR_ESTIMATE_PROCESSING', label: 'Repair Estimate', action: 'estimate' };
  }
  if (s === 'REPAIR_ESTIMATE_PROCESSING' || s === 'ESTIMATE_SUBMITTED') {
    return { code: 'DEVICE_PICKED_UP', label: 'Device Picked Up' };
  }
  if (s === 'DEVICE_PICKED_UP' || s === 'PICKED_UP') {
    return { code: 'REACHED_SHOP', label: 'Reached Shop', action: 'reached' };
  }
  if (s === 'REACHED_SHOP') {
    return { code: 'RECEIVED_AT_SHOP', label: 'Received at Shop' };
  }
  return null;
}

/** A failed pickup can be reported only before the device is collected. */
export const canReportProblem = (b) => {
  const i = stepIndex(b?.status);
  return i >= 0 && i <= PICKUP_STEPS.findIndex((s) => s.key === 'ESTIMATE');
};

// Failed pickup / reschedule reasons. Only "Customer cancelled" changes the
// booking (CANCELLED + reason, the one supported pickup-person action); the
// others have no backend endpoint yet, so the booking is left as it is.
export const PROBLEM_REASONS = [
  { code: 'CUSTOMER_UNAVAILABLE', label: 'Customer unavailable' },
  { code: 'WRONG_ADDRESS', label: 'Wrong address' },
  { code: 'DEVICE_UNAVAILABLE', label: 'Device unavailable' },
  { code: 'RESCHEDULE', label: 'Customer requested reschedule' },
  { code: 'CUSTOMER_CANCELLED', label: 'Customer cancelled', cancels: true },
  { code: 'OTHER', label: 'Other' },
];

// The owner sets PICKUP_ASSIGNED on both first assignment and reassignment;
// only the latest assignment event tells them apart.
export function latestAssignmentEvent(events) {
  let best = null;
  (Array.isArray(events) ? events : []).forEach((ev) => {
    const code = up(ev?.status);
    if (code !== 'PICKUP_REASSIGNED' && code !== 'PICKUP_ASSIGNED') return;
    const ts = ev.createdAt ? new Date(ev.createdAt).getTime() : 0;
    if (!best || ts >= best.ts) best = { code, ts };
  });
  return best ? best.code : null;
}
export const isReassigned = (b) => up(b?.status) === 'PICKUP_REASSIGNED' || latestAssignmentEvent(b?.events) === 'PICKUP_REASSIGNED';

/** Last CANCELLED event: { byMe (pickup person), note, at } or null. */
export function cancelInfo(b) {
  if (up(b?.status) !== 'CANCELLED') return null;
  const ev = sortEvents(b.events).reverse().find((e) => up(e.status) === 'CANCELLED');
  return { byMe: up(ev?.actor) === 'PICKUP_PERSON', note: ev?.note || '', at: ev?.createdAt || b.updatedAt || null };
}

/**
 * Events oldest first by server time; equal times keep the server's order.
 * A row is dropped only when its server event id was already listed — never
 * by status, since a pickup can legitimately be reassigned or reach the shop
 * more than once.
 */
export function sortEvents(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : [])
    .filter((e) => !e?.id || (!seen.has(e.id) && seen.add(e.id)))
    .map((e, i) => ({ e, i, t: new Date(e.createdAt || 0).getTime() || 0 }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((x) => x.e);
}

// After hand-over the shop's repair updates land in the same event table;
// they keep their own names (serviceHistoryPhases) instead of "Handed Over".
const SHOP_STATUS_LABEL = Object.fromEntries(SHOP_BOOKING_STATUS_OPTIONS.map((o) => [o.value, o.label]));
const titleCase = (s) => s.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
/** Timeline label for one event's status. */
export function eventLabel(status) {
  const s = up(status);
  if (s === 'RECEIVED_AT_SHOP') return 'Handed Over to Shop';
  return META[s]?.label || SHOP_STATUS_LABEL[s] || (s ? titleCase(s) : 'Status Update');
}
/** Dot colour for one event (shop repair updates in navy). */
export const eventColor = (status) => META[up(status)]?.color || '#1C3053';
const ACTORS = { PICKUP_PERSON: 'You', SHOP: 'Shop', OWNER: 'Shop', CUSTOMER: 'Customer', TECHNICIAN: 'Technician', SYSTEM: 'System' };
/** Who did it, for "time · by …" lines. */
export const actorLabel = (actor) => ACTORS[up(actor)] || (actor ? titleCase(String(actor)) : 'System');

/** Booking number, else a short id. */
export const trackingId = (b) => b?.bookingNumber || `#${String(b?.id || '').replace(/[^0-9a-zA-Z]/g, '').slice(0, 12).toUpperCase()}`;

// "Vivo" + "Vivo T1" → "Vivo T1" (model names often carry the brand).
export const deviceLabel = (b) => {
  const brand = String(b?.brandName || '').trim();
  const model = String(b?.modelName || '').trim();
  if (brand && model.toLowerCase().startsWith(brand.toLowerCase())) return model;
  return [brand, model].filter(Boolean).join(' ') || 'Device';
};
export const issueLabel = (b) => b?.issueSummary || b?.services?.[0]?.serviceName || 'Service';
export const customerPhone = (b) => b?.customerMobile || b?.pickupAddressMobile || '';

// ── Dates (24-hour) ────────────────────────────────────────────────────────
const toDate = (v) => { if (!v) return null; const d = v instanceof Date ? v : new Date(v); return Number.isNaN(d.getTime()) ? null : d; };
export function dayKey(v) {
  const d = toDate(v);
  return d ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` : '';
}
export const todayKey = () => dayKey(new Date());
/** The pickup's scheduled day "YYYY-MM-DD" (created day when none is set). */
export const pickupDay = (b) => (/^\d{4}-\d{2}-\d{2}/.test(String(b?.pickupDate || '')) ? String(b.pickupDate).slice(0, 10) : dayKey(b?.createdAt));
const hm = (t) => (t ? String(t).slice(0, 5) : '');
/** "10:00 – 12:00", "10:00" or "". */
export const slotLabel = (b) => [hm(b?.pickupSlotStart), hm(b?.pickupSlotEnd)].filter(Boolean).join(' – ');
/** Minutes from midnight for "HH:mm[:ss]", or null. */
export function minutesOf(t) {
  const [h, m] = String(t || '').split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}
/** "30 Oct 2026" from a "YYYY-MM-DD" key or a date. */
export function fmtDay(v) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? new Date(`${v}T00:00:00`) : toDate(v);
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
}
/** "30 Oct 2026 · 14:05" */
export function fmtStamp(v) {
  const d = toDate(v);
  return d ? `${fmtDay(d)} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}` : '';
}
// Slot window [s, e) in minutes; a slot without an end counts as 30 min.
function slotWindow(b) {
  const s = minutesOf(b?.pickupSlotStart);
  if (s == null) return null;
  const end = minutesOf(b?.pickupSlotEnd);
  return { s, e: end != null && end > s ? end : s + 30 };
}
/** Other in-hand pickups on the same day whose time slots overlap this one's. */
export function overlapsFor(b, list) {
  const w = slotWindow(b);
  if (!w || !isActive(b)) return [];
  const day = pickupDay(b);
  return (list || []).filter((o) => {
    if (!o || o.id === b.id || !isActive(o) || pickupDay(o) !== day) return false;
    const x = slotWindow(o);
    return !!x && x.s < w.e && w.s < x.e;
  });
}
/** Local Date of the pickup's slot start (null without a date + slot). */
export function slotStartAt(b) {
  const key = pickupDay(b);
  const m = minutesOf(b?.pickupSlotStart);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || m == null) return null;
  const [y, mo, d] = key.split('-').map(Number);
  return new Date(y, mo - 1, d, Math.floor(m / 60), m % 60);
}

/** "27 Oct, 14:05" (year only when not this year) — for narrow card lines. */
export function fmtShortStamp(v) {
  const d = toDate(v);
  if (!d) return '';
  const day = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: 'numeric' }) });
  return `${day}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
/** "Today" / "Tomorrow" / "Yesterday" / "30 Oct". */
export function relDay(key) {
  const off = (n) => dayKey(new Date(Date.now() + n * 86400000));
  if (key === off(0)) return 'Today';
  if (key === off(1)) return 'Tomorrow';
  if (key === off(-1)) return 'Yesterday';
  const d = new Date(`${key}T00:00:00`);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

// Earliest pickup first (day, then slot start).
export const bySchedule = (a, b) => (pickupDay(a) + hm(a.pickupSlotStart || '99:99')).localeCompare(pickupDay(b) + hm(b.pickupSlotStart || '99:99'));
