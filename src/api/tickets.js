import { ticketApi } from './client';

// `assignedToMe=true` is honored by ticket-service's TicketController#list —
// it ignores the status param in that branch, so any status filter is
// applied client-side after the fetch.
export async function listMyTickets({ page = 0, size = 20 } = {}) {
  return ticketApi.get('/tickets', { query: { assignedToMe: true, page, size } });
}

export async function getTicket(ticketId) {
  return ticketApi.get(`/tickets/${ticketId}`);
}

// Technician's explicit Accept. Backend sets tickets.technician_accepted_at
// to now() and emits TECHNICIAN_ACCEPTED_SERVICE + TECHNICIAN_WORK_STARTED
// to the customer/owner timeline. Walk-in tickets at CREATED also have their
// status bumped to IN_DIAGNOSIS server-side. Idempotent.
export async function acceptTicket(ticketId) {
  return ticketApi.post(`/tickets/${ticketId}/accept`);
}

// Booking timeline for a ticket, used by the Ticket Detail screen to derive
// the current work-status dropdown label from the most recently emitted event.
export async function listTicketEvents(ticketId) {
  return ticketApi.get(`/tickets/${ticketId}/events`);
}

// Manual emit for the Service Progress checklist on the Ticket Detail screen.
// statusKey must be in ticket-service's ALLOWED_PROGRESS_STEP_KEYS:
//   IN_REPAIR, PARTS_REQUIRED,
//   QUALITY_CHECK_COMPLETED, REPAIR_COMPLETED, READY, INVOICE_GENERATED,
//   INVOICE_READY, DELIVERED_PROCESSING, DELIVERED, CANCELLED, RETURN_DELIVERY,
//   REPAIR_NOT_COMPLETED.
// (REPAIR_NOT_COMPLETED is accepted — it emits the "Your repair is not
// completed" row without advancing ticket.status.) The backend treats
// re-submits as a refresh of the existing row's note + timestamp.
export async function postProgressEvent(ticketId, { statusKey, note } = {}) {
  return ticketApi.post(`/tickets/${ticketId}/progress-events`, {
    body: { statusKey, note },
  });
}

// Backend TicketService#patch accepts a generic Map; sending technicianPhotosJson
// as a stringified JSON array is the same shape devicePhotosJson uses.
export async function setTechnicianPhotos(ticketId, photoUrls) {
  return ticketApi.patch(`/tickets/${ticketId}`, {
    body: { technicianPhotosJson: JSON.stringify(photoUrls || []) },
  });
}

export async function addRepairNote(
  ticketId,
  { note, isInternal, audioUrl, imageUrls } = {},
) {
  return ticketApi.post(`/tickets/${ticketId}/notes`, {
    body: { note, isInternal, audioUrl, imageUrls },
  });
}

// Edit a note that was already submitted (Submitted Notes → Edit). Body is the
// same shape as addRepairNote and is absolute, not a patch: whatever imageUrls
// / audioUrl are sent become the note's attachments, so removing a photo means
// sending the shorter list. The backend keeps the note's original createdAt and
// only moves updatedAt, and refreshes the customer/owner timeline row in place
// when this is the most recent customer-visible note.
export async function updateRepairNote(
  ticketId,
  noteId,
  { note, isInternal, audioUrl, imageUrls } = {},
) {
  return ticketApi.put(`/tickets/${ticketId}/notes/${noteId}`, {
    body: { note, isInternal, audioUrl, imageUrls },
  });
}

export async function listRepairNotes(ticketId) {
  return ticketApi.get(`/tickets/${ticketId}/notes`);
}

export async function listSolutionPacks(ticketId, { packType } = {}) {
  return ticketApi.get(`/tickets/${ticketId}/solution-packs`, { query: { packType } });
}

export async function createSolutionPack(ticketId, payload) {
  return ticketApi.post(`/tickets/${ticketId}/solution-packs`, { body: payload });
}

// Shop-wide search backing the "Issue Reference Solution Pack View" screen.
// Any of the filters may be omitted; the backend treats null as match-any.
export async function searchSolutionPacks({
  packType, brandId, modelId,
  issueCategoryId, issueSubcategoryId,
  issueCategory, issueSubcategory,
} = {}) {
  return ticketApi.get('/solution-packs/search', {
    // Backend accepts both the UUID id filters and the string-name filters;
    // the reference screen passes ids, so forward those (were previously dropped).
    query: { packType, brandId, modelId, issueCategoryId, issueSubcategoryId, issueCategory, issueSubcategory },
  });
}
