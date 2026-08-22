import { ticketApi } from './client';

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
export async function listMyAssignedPickups(status) {
  return unwrap(await ticketApi.get('/technicians/me/pickup-bookings', {
    query: status ? { status } : undefined,
    skipAuthExpiry: true,
  }));
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
export async function updatePickupStatus(bookingId, nextStatus, opts) {
  const { note, latitude, longitude } = opts || {};
  return await ticketApi.patch(`/technicians/me/pickup-bookings/${bookingId}/status`, {
    body: {
      status: nextStatus,
      ...(note ? { note } : {}),
      ...(latitude != null ? { latitude } : {}),
      ...(longitude != null ? { longitude } : {}),
    },
  });
}

export async function getPickupRepairEstimate(bookingId) {
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
