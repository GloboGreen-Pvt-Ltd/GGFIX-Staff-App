import { listTicketEvents } from '../api/tickets';
import { partsWaitFromEvents } from './serviceProgress';

// Any of these on a job's history means the repair is done, so the job counts
// as Completed straight away — no waiting for the shop to verify it or move
// the booking to Ready for Delivery. These are the same events the Job Report
// card labels "Repair Completed" / "Quality Check Completed", so the bucket
// always agrees with the label, whoever recorded the step.
const DONE_KEYS = new Set(['REPAIR_COMPLETED', 'QUALITY_CHECK_COMPLETED', 'READY', 'DELIVERED']);

// Statuses that already decide the bucket on their own (pending, cancelled, or
// at/after Ready for Delivery). Only the rest need their events checked.
const SKIP_STATUSES = new Set([
  'CREATED', 'IN_DIAGNOSIS', 'QUOTED', 'CANCELLED',
  'READY', 'INVOICE_GENERATED', 'INVOICE_READY', 'DELIVERED_PROCESSING', 'DELIVERED',
]);

export function needsRepairDoneCheck(status) {
  return !SKIP_STATUSES.has(String(status || '').toUpperCase());
}

export function eventsShowRepairDone(events) {
  return (Array.isArray(events) ? events : [])
    .some((e) => DONE_KEYS.has((e?.status || '').toUpperCase()));
}

// Positive results only, keyed by id + updatedAt: a done job stays done until
// the ticket itself changes (a re-estimate), so polls don't re-fetch it.
const doneCache = new Set();

// { [ticketId]: { repairDone, partsWait } } for the in-progress tickets whose
// events show the repair done, or an open Spare Parts Waiting row (partsWait
// is that row). Tickets with neither are left out.
export async function loadProgressFlags(tickets) {
  const out = {};
  const candidates = (Array.isArray(tickets) ? tickets : [])
    .filter((t) => t?.id != null && needsRepairDoneCheck(t.status));
  await Promise.all(candidates.map(async (t) => {
    const key = `${t.id}:${t.updatedAt || ''}`;
    if (doneCache.has(key)) { out[t.id] = { repairDone: true, partsWait: null }; return; }
    try {
      const events = await listTicketEvents(t.id);
      const repairDone = eventsShowRepairDone(events);
      if (repairDone) doneCache.add(key);
      const partsWait = repairDone ? null : partsWaitFromEvents(events);
      if (repairDone || partsWait) out[t.id] = { repairDone, partsWait };
    } catch { /* leave it to the status bucket */ }
  }));
  return out;
}

// { [ticketId]: true } for the tickets whose events show the repair done.
export async function loadRepairDone(tickets) {
  const flags = await loadProgressFlags(tickets);
  return Object.fromEntries(Object.keys(flags).filter((id) => flags[id].repairDone).map((id) => [id, true]));
}
