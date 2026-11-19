// Single source of truth for the displayed employee ID so every surface
// (Account, Home, Payslip, PDF) shows the SAME value. Previously each screen
// derived it independently (Account/Home sliced 5 chars, Payslip sliced 8),
// so the same employee appeared under different IDs.

function formatEmpId(id) {
  return `EM-${String(id).replace(/-/g, '').slice(0, 5).toUpperCase()}`;
}

export function employeeIdFromSession(session) {
  if (session?.employeeId) return session.employeeId;
  if (session?.technicianId) return formatEmpId(session.technicianId);
  if (session?.userId) return formatEmpId(session.userId);
  return 'EM-00000';
}

export function employeeIdFromTechnicianId(technicianId) {
  return technicianId ? formatEmpId(technicianId) : '—';
}
