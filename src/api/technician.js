import { ticketApi } from './client';

// All technician endpoints live on the ticket-service (port 8082) under
// /technicians — so we reuse ticketApi which already targets that base.

export async function getMyTechnicianProfile() {
  return ticketApi.get('/technicians/me');
}

export async function getTodayAttendance() {
  // Backend returns 204 No Content when there's no record for today.
  // ticketApi's request() returns null for empty bodies, so callers see null.
  return ticketApi.get('/technicians/me/attendance/today', { skipAuthExpiry: true });
}

export async function getMonthlyAttendance(technicianId, month, year) {
  return ticketApi.get(`/technicians/${technicianId}/attendance`, { query: { month, year } });
}

export async function getMyLeaves(technicianId, { month, year } = {}) {
  return ticketApi.get(`/technicians/${technicianId}/leaves`, { query: { month, year } });
}

// Check-in / check-out ship the employee's GPS so the backend can enforce the
// 100m shop geofence. On failure the thrown error carries `err.status = 422`
// and `err.payload.code` ∈ { LOCATION_REQUIRED, OUT_OF_RADIUS,
// EARLY_CHECKOUT_BLOCKED } plus `distanceMeters` / `allowedTime` details.
export async function checkIn({ notes, latitude, longitude } = {}) {
  return ticketApi.post('/technicians/me/attendance/check-in', {
    body: {
      ...(notes ? { notes } : {}),
      ...(latitude != null ? { latitude } : {}),
      ...(longitude != null ? { longitude } : {}),
    },
  });
}

export async function checkOut({ notes, latitude, longitude } = {}) {
  return ticketApi.post('/technicians/me/attendance/check-out', {
    body: {
      ...(notes ? { notes } : {}),
      ...(latitude != null ? { latitude } : {}),
      ...(longitude != null ? { longitude } : {}),
    },
  });
}

export async function getMyExperiences(technicianId) {
  return ticketApi.get(`/technicians/${technicianId}/experiences`);
}

// -------- Employee leave (Apply for Leave) --------
// The employee app always uses the /me endpoints so the backend can resolve
// the technician row from the JWT, not a client-supplied id. Owner-side
// approval lives on the mobile owner app and hits /technicians/{id}/leaves/*.

export async function applyEmployeeLeave({ leaveType, startDate, endDate, totalDays, reason, attachmentUrl }) {
  return ticketApi.post('/technicians/me/leaves', {
    body: { leaveType, startDate, endDate, totalDays, reason, attachmentUrl },
  });
}

export async function getEmployeeLeaveRequests(technicianId, { month, year } = {}) {
  return ticketApi.get(`/technicians/${technicianId}/leaves`, { query: { month, year } });
}

export async function getShopPendingLeaves() {
  return ticketApi.get('/technicians/leaves/pending');
}

export async function approveLeaveRequest(technicianId, leaveId, { remarks } = {}) {
  return ticketApi.patch(`/technicians/${technicianId}/leaves/${leaveId}/approve`, {
    body: { status: 'APPROVED', remarks: remarks || null },
  });
}

export async function rejectLeaveRequest(technicianId, leaveId, { rejectionReason }) {
  return ticketApi.patch(`/technicians/${technicianId}/leaves/${leaveId}/reject`, {
    body: { status: 'REJECTED', rejectionReason },
  });
}
