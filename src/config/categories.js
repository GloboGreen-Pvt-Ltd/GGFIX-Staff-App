import {
  AlarmClock,
  CalendarClock,
  CalendarRange,
  LogOut,
  ClipboardList,
  Laptop,
  ListChecks,
  ReceiptText,
  Truck,
  ScrollText,
  Timer,
} from 'lucide-react-native';

// Master list of every category tile the employee app can render.
// `route` is the stack route opened on tap. Labels carry the line breaks
// shown in the design (two-line tiles).
export const CATEGORY_DEFS = {
  daily_attendance: { label: 'Daily\nAttendance', icon: AlarmClock, route: 'DailyAttendance' },
  daily_shift:      { label: 'Daily Shift\nSchedule', icon: CalendarClock, route: 'DailyShiftSchedule' },
  monthly_summary:  { label: 'Monthly\nSummary', icon: CalendarRange, route: 'MonthlySummary' },
  leave_request:    { label: 'Leave\nRequest', icon: LogOut, route: 'TechnicianApplyLeave' },
  apply_permission: { label: 'Apply\nPermission', icon: Timer, route: 'PermissionApply' },
  leave_report:     { label: 'Leave\nReport', icon: ClipboardList, route: 'LeaveReport' },
  assign_task:      { label: 'Assign\nTask', icon: Laptop, route: 'TaskAssign' },
  task_report:      { label: 'Task\nReport', icon: ListChecks, route: 'TaskReport' },
  assign_pickup:    { label: 'Assign\nPickup', icon: Truck, route: 'PickupAssign' },
  pickup_report:    { label: 'Pickup\nReport', icon: ScrollText, route: 'PickupReport' },
  salary_report:    { label: 'Salary\nReport', icon: ReceiptText, route: 'SalaryReport' },
};

// Per-role visible tiles, in display order.
//   STAFF        — no task / pickup tiles at all.
//   TECHNICIAN   — Assign Task + Task Report (assigned-ticket workflow).
//   PICKUP_PERSON — Assign Pickup + Pickup Report (same workflow, relabeled).
const ROLE_CATEGORIES = {
  STAFF: [
    'daily_attendance', 'daily_shift', 'monthly_summary', 'leave_request',
    'apply_permission', 'leave_report', 'salary_report',
  ],
  TECHNICIAN: [
    'daily_attendance', 'daily_shift', 'monthly_summary', 'leave_request',
    'apply_permission', 'leave_report', 'assign_task', 'task_report', 'salary_report',
  ],
  PICKUP_PERSON: [
    'daily_attendance', 'daily_shift', 'monthly_summary', 'leave_request',
    'apply_permission', 'leave_report', 'assign_pickup', 'pickup_report', 'salary_report',
  ],
};

// The platform stores pickup persons as `technicians` rows whose `roleLabel`
// is 'Pickup Person' — see project memory. So we prefer roleLabel when the
// auth response provides it, then fall back to the roles[] array.
// Legacy auth rows stored the role as 'PICKUP PERSON' (space) instead of the
// canonical 'PICKUP_PERSON' (underscore); normalize both forms before matching.
export function resolveRoleKey(session) {
  const label = String(session?.roleLabel || '').toLowerCase();
  if (label.includes('pickup')) return 'PICKUP_PERSON';
  if (label.includes('staff')) return 'STAFF';
  if (label.includes('technician')) return 'TECHNICIAN';

  const roles = (session?.roles || []).map((r) =>
    String(r || '').trim().toUpperCase().replace(/\s+/g, '_')
  );
  if (roles.includes('SHOP_OWNER')) return 'STAFF';
  if (roles.includes('STAFF')) return 'STAFF';
  if (roles.includes('PICKUP_PERSON')) return 'PICKUP_PERSON';
  if (roles.includes('TECHNICIAN')) return 'TECHNICIAN';
  return 'TECHNICIAN';
}

export function getCategoriesForSession(session) {
  const key = resolveRoleKey(session);
  const list = ROLE_CATEGORIES[key] || ROLE_CATEGORIES.TECHNICIAN;
  return list.map((k) => ({ key: k, ...CATEGORY_DEFS[k] }));
}

export function getRoleDisplayLabel(session) {
  const key = resolveRoleKey(session);
  if (key === 'PICKUP_PERSON') return 'Pickup Person';
  if (key === 'STAFF') return 'Staff';
  return 'Technician';
}
