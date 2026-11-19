import { acceptedForCurrentAssignment } from './assignment';
import { currentEvents, eventTime, findEvent, partsWaitFromEvents } from './serviceProgress';

// My Jobs sections, in the rail's order. Each job sits in exactly one, decided
// from the ticket and its booking events as the backend returns them:
//   Assigned   — assigned to me, not accepted yet (no technicianAcceptedAt)
//   Reassigned — same, but the job was re-assigned to me (REASSIGNED_TO_TECHNICIAN)
//   In Process — accepted and the repair is running (also a job sent back
//                after Repair Completed, e.g. a failed Quality Check)
//   Pending    — accepted but waiting: customer approval / re-estimate,
//                spare parts, or the Quality Check after Repair Completed
//   Completed  — Quality Check Completed, or the shop's handover statuses
//   Cancelled  — cancelled (rejected by the employee or cancelled by the shop)
export const JOB_STAGES = ['All', 'Assigned', 'Reassigned', 'In Process', 'Pending', 'Completed', 'Cancelled'];

const up = (v) => String(v || '').toUpperCase();

// Statuses at/after the shop's handover: the technician's part is over.
const HANDOVER_STATUSES = new Set([
  'READY', 'INVOICE_GENERATED', 'INVOICE_READY', 'DELIVERED_PROCESSING', 'DELIVERED', 'RETURN_DELIVERY',
]);
// Before the events load: these statuses mean the job is waiting.
const WAITING_STATUSES = new Set(['CREATED', 'IN_DIAGNOSIS', 'QUOTED']);
// Work recorded after Repair Completed puts the job back In Process.
const REWORK_KEYS = new Set(['IN_REPAIR', 'REPAIR_WORK_RESUMED', 'PARTS_REQUIRED', 'PARTS_RECEIVED', 'TECHNICIAN_REESTIMATE_REQUESTED']);

const wasReassigned = (events) => events.some((e) => up(e?.status) === 'REASSIGNED_TO_TECHNICIAN');

// events: the ticket's GET /tickets/{id}/events rows, or null/undefined while
// not loaded (the ticket status decides until they arrive).
export function jobStage(ticket, events) {
  const s = up(ticket?.status);
  if (s === 'CANCELLED') return 'Cancelled';
  if (HANDOVER_STATUSES.has(s)) return 'Completed';
  const rows = Array.isArray(events) ? events : null;
  if (!acceptedForCurrentAssignment(ticket, rows)) return rows && wasReassigned(rows) ? 'Reassigned' : 'Assigned';
  if (!rows) return WAITING_STATUSES.has(s) ? 'Pending' : 'In Process';
  const cur = currentEvents(rows);
  if (findEvent(cur, 'QUALITY_CHECK_COMPLETED')) return 'Completed';
  // Unable to repair: the technician's part is over (unless resumed after it).
  const notDone = findEvent(cur, 'REPAIR_NOT_COMPLETED');
  if (notDone && !cur.some((e) => ['REPAIR_WORK_RESUMED', 'IN_REPAIR'].includes(up(e?.status)) && eventTime(e) > eventTime(notDone))) return 'Completed';
  const done = findEvent(cur, 'REPAIR_COMPLETED');
  if (done) {
    const doneAt = eventTime(done);
    const reworked = cur.some((e) => REWORK_KEYS.has(up(e?.status)) && eventTime(e) > doneAt);
    return reworked ? 'In Process' : 'Pending'; // waiting for the Quality Check
  }
  if (s === 'QUOTED' || partsWaitFromEvents(rows)) return 'Pending';
  const started = findEvent(cur, 'IN_REPAIR') || findEvent(cur, 'REPAIR_WORK_RESUMED');
  return started ? 'In Process' : 'Pending'; // accepted, customer approval not in yet
}

// Awaiting the employee's Accept / Reject.
export const isAwaitingAccept = (stage) => stage === 'Assigned' || stage === 'Reassigned';

// Jobs whose section can still change are re-read on every load; Completed /
// Cancelled ones keep their first events read.
export const isLiveStage = (stage) => stage !== 'Completed' && stage !== 'Cancelled';
