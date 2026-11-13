import { eventTime } from './serviceProgress';

// Ticket assignment helpers. A ticket belongs to whoever ticket-service lists
// as assignedTechnicianId — an employee or the owner working as technician.
// After a reassignment the new technician must Accept again, and the job then
// resumes from the ticket's latest progress (same ticket, same history).

const ASSIGN_KEYS = new Set(['ASSIGNED_TO_TECHNICIAN', 'TECHNICIAN_ASSIGNED', 'REASSIGNED_TO_TECHNICIAN']);

// Unknown ids never block (profile still loading, older payloads).
export const isAssignedTo = (ticket, techId) => !techId || !ticket?.assignedTechnicianId
  || String(ticket.assignedTechnicianId) === String(techId);

export function lastAssignedAt(events) {
  if (!Array.isArray(events)) return 0;
  return events.reduce((max, e) => (ASSIGN_KEYS.has(String(e?.status || '').toUpperCase())
    ? Math.max(max, eventTime(e) || 0) : max), 0);
}

// An accept recorded before the latest (re)assignment belongs to the previous
// technician, so the current one still has to Accept.
export function acceptedForCurrentAssignment(ticket, events) {
  if (!ticket?.technicianAcceptedAt) return false;
  const at = lastAssignedAt(events);
  const accepted = Date.parse(ticket.technicianAcceptedAt);
  return !at || !Number.isFinite(accepted) || accepted >= at;
}

export const withCurrentAcceptance = (ticket, events) => (
  ticket?.technicianAcceptedAt && !acceptedForCurrentAssignment(ticket, events)
    ? { ...ticket, technicianAcceptedAt: null } : ticket);

// Backend refusal because the job is no longer this technician's.
export const isAssignmentConflict = (e) => e?.status === 403 || e?.status === 409;
