import { getTicket, listTicketEvents, postProgressEvent } from '../api/tickets';
import { shouldAutoStartRepair } from './serviceProgress';

// Record "Repair Work Started" (IN_REPAIR) for a ticket the technician just
// accepted — from a fresh read, so the rule in shouldAutoStartRepair (approval
// current, no IN_REPAIR yet) is checked against what the backend holds now.
// Best-effort: Job Details runs the same check when the job is opened, and
// Finish Repair records the step itself if it is still missing.
export async function autoStartRepair(ticketId) {
  try {
    const [ticket, events] = await Promise.all([getTicket(ticketId), listTicketEvents(ticketId)]);
    if (!shouldAutoStartRepair(ticket, events)) return false;
    await postProgressEvent(ticketId, { statusKey: 'IN_REPAIR' });
    return true;
  } catch (e) {
    console.warn('[progress] automatic Repair Work Started failed', e?.status, e?.message);
    return false;
  }
}
