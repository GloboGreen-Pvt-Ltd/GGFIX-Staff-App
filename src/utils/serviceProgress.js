// Automatic Service Progress — which steps the Employee app records on its own
// as the technician works, and when. Pure functions over the ticket, its
// booking events (GET /tickets/{id}/events) and its repair notes, so the rules
// can be unit-tested; the API calls live in utils/autoProgress.js and the
// Job Details screen.
//
// Every automatic step goes through an existing endpoint and an existing step
// key, and is only shown as done once the backend has it:
//   Repair Work Started   IN_REPAIR via POST /tickets/{id}/progress-events —
//                         after Accept, but never before the customer approval
//   Issue Verified        the backend's own TECHNICIAN_COMPLIANCE_ISSUE_VERIFIED_UPDATED
//                         row, written when the issue note saves
//   Repair Photos Added   TECHNICIAN_UPLOADED_DEVICE_IMAGES, written by the
//                         backend when the note's photos are PATCHed onto the ticket

// Description + this many uploaded photos make a complete issue note.
export const MIN_NOTE_PHOTOS = 2;

const up = (v) => String(v || '').toUpperCase();
const evTime = (e) => Math.max(
  new Date(e?.createdAt || 0).getTime() || 0,
  new Date(e?.updatedAt || 0).getTime() || 0,
);
const list = (v) => (Array.isArray(v) ? v : []);

// Uploaded photos on a saved technician note, each URL once.
function noteImages(n) {
  return [...new Set(list(n?.imageUrls).filter(Boolean))];
}

// A saved note with a description and the required photos. Notes saved under
// the old one-photo rule have to be edited up to two.
export function noteIsComplete(n) {
  return !!String(n?.note || '').trim() && noteImages(n).length >= MIN_NOTE_PHOTOS;
}

// Most photos uploaded on any one saved note — the "n of 2" on the checklist.
export function savedNotePhotoCount(notes) {
  return list(notes).reduce((max, n) => Math.max(max, noteImages(n).length), 0);
}

// Server time of a booking event (the later of createdAt / updatedAt — the
// backend refreshes a re-saved row in place).
export const eventTime = evTime;

// Re-estimate workflow events (ticket_reestimate_revisions): a customer
// decision on a revision, and the repair resuming after it.
const REVISION_DECISION_KEYS = ['RE_ESTIMATE_APPROVED', 'RE_ESTIMATE_REJECTED'];
const REVISION_RESUME_KEYS = [...REVISION_DECISION_KEYS, 'REPAIR_WORK_RESUMED'];
const latestAt = (rows, keys) => rows
  .filter((e) => keys.includes(up(e?.status)))
  .reduce((max, e) => Math.max(max, evTime(e)), 0);

// Where the checklist restarts (0 = it doesn't). A legacy re-estimate restarts
// it at the latest RE_ESTIMATED_CONFIRMED. A re-estimate raised during the
// repair does not: one the customer has decided (the backend moves the job
// back to IN_REPAIR and records REPAIR_WORK_RESUMED), or one answering an open
// technician request — the same repair continues on the same steps.
export function checklistResetAt(events) {
  const rows = list(events);
  const reEstimatedAt = latestAt(rows, ['RE_ESTIMATED_CONFIRMED']);
  if (!reEstimatedAt) return 0;
  const resumedAt = latestAt(rows, REVISION_RESUME_KEYS);
  if (resumedAt >= reEstimatedAt) return 0;
  const requestedAt = latestAt(rows, ['TECHNICIAN_REESTIMATE_REQUESTED']);
  if (requestedAt && requestedAt <= reEstimatedAt && requestedAt > resumedAt) return 0;
  return reEstimatedAt;
}

// Events that belong to the current quote: steps recorded before the
// checklist's restart point (see checklistResetAt) don't count.
export function currentEvents(events) {
  const rows = list(events);
  const resetAt = checklistResetAt(rows);
  return resetAt ? rows.filter((e) => evTime(e) >= resetAt) : rows;
}

export function findEvent(events, key) {
  return list(events).find((e) => up(e?.status) === key) || null;
}

// Customer approval for the current estimate: a CUSTOMER_APPROVED row no older
// than the latest re-estimate, or — on tickets older than that event — the
// ticket's own customerApproval flag. Same rule as the "Customer Approved" card.
export function approvalIsCurrent(ticket, events) {
  const latestOf = (key) => list(events)
    .filter((e) => up(e?.status) === key)
    .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
    .pop() || null;
  const reEstimated = latestOf('RE_ESTIMATED_CONFIRMED');
  const approved = latestOf('CUSTOMER_APPROVED');
  // A revision the customer has decided (approved, or rejected — the original
  // approved estimate is restored) settles the latest re-estimate.
  if (reEstimated && latestAt(list(events), REVISION_DECISION_KEYS) >= evTime(reEstimated)) return true;
  if (approved) {
    return !reEstimated || new Date(approved.createdAt || 0) >= new Date(reEstimated.createdAt || 0);
  }
  return ticket?.customerApproval === true;
}

// Statuses where repair work can still start. READY and later, CANCELLED and
// RETURNED never get an automatic step, so old and closed bookings are left as
// they are. QUOTED is out too: the customer hasn't answered the estimate. A
// decided re-estimate moves the ticket back to IN_REPAIR (or APPROVED when work
// hadn't started), so the repair continues from there.
const STARTABLE_STATUSES = new Set(['IN_DIAGNOSIS', 'APPROVED', 'IN_REPAIR']);
// Statuses where the technician is still working the job (photos can sync).
const ACTIVE_STATUSES = new Set(['CREATED', 'IN_DIAGNOSIS', 'QUOTED', 'APPROVED', 'IN_REPAIR']);
// Any of these on the current checklist means the repair stage is over.
const REPAIR_END_KEYS = [
  'REPAIR_COMPLETED', 'QUALITY_CHECK_COMPLETED', 'REPAIR_NOT_COMPLETED',
  'READY', 'RETURN_DELIVERY', 'DELIVERED',
];

// Why "Repair Work Started" hasn't happened yet, or null once it can.
export function repairStartBlocker(ticket, events) {
  if (!ticket?.technicianAcceptedAt) return 'Starts automatically when you accept the task.';
  if (!approvalIsCurrent(ticket, events)) return 'Starts automatically once the customer approves.';
  return null;
}

// Record IN_REPAIR by itself? Only for an accepted job whose customer approval
// is current, that is still in the repair stage, and that has no IN_REPAIR row
// yet from anyone — re-posting would overwrite the original start time.
export function shouldAutoStartRepair(ticket, events) {
  if (!STARTABLE_STATUSES.has(up(ticket?.status))) return false;
  if (repairStartBlocker(ticket, events)) return false;
  const cur = currentEvents(events);
  if (findEvent(cur, 'IN_REPAIR') || findEvent(cur, 'REPAIR_WORK_RESUMED')) return false;
  return !REPAIR_END_KEYS.some((k) => findEvent(cur, k));
}

function urlsOf(raw) {
  let v = raw;
  if (typeof raw === 'string') {
    try { v = JSON.parse(raw); } catch { return []; }
  }
  return list(v).map((x) => (typeof x === 'string' ? x : x?.url)).filter(Boolean);
}

// Photos to PATCH onto ticket.technicianPhotosJson so the backend records
// "Technician Uploaded Device Images" on the shared timeline — the latest
// complete note's uploads. null when there's nothing to do: the ticket already
// carries technician photos (never overwrite an older booking's), the job is
// past the repair stage, or no saved note has the required photos.
export function photosToSync(ticket, notes) {
  if (!ACTIVE_STATUSES.has(up(ticket?.status))) return null;
  if (urlsOf(ticket?.technicianPhotosJson).length > 0) return null;
  const complete = list(notes)
    .filter(noteIsComplete)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0];
  return complete ? noteImages(complete) : null;
}

// Resume Repair re-saves the Spare Parts Waiting row with its note starting
// this (production doesn't accept PARTS_RECEIVED yet).
export const PARTS_RECEIVED_MARK = '✓ Parts received';

// The open Spare Parts Waiting row, or null: a PARTS_REQUIRED row on the
// current quote that hasn't been resumed (PARTS_RECEIVED, or the row re-saved
// with PARTS_RECEIVED_MARK) and whose repair stage hasn't ended.
export function partsWaitFromEvents(events) {
  const cur = currentEvents(events);
  const wait = findEvent(cur, 'PARTS_REQUIRED');
  if (!wait) return null;
  if (findEvent(cur, 'PARTS_RECEIVED') || String(wait.note || '').startsWith(PARTS_RECEIVED_MARK)) return null;
  return REPAIR_END_KEYS.some((k) => findEvent(cur, k)) ? null : wait;
}

// Ready for Delivery is deliberately not here: READY is the backend's move on
// QUALITY_CHECK_COMPLETED, never the app's (a second READY post duplicates the
// timeline row and the customer notification).
