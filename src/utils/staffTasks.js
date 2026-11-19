import {
  Truck, Package, ShoppingCart, Landmark, UserRound, Building2, Sparkles, ClipboardList, Wrench,
} from 'lucide-react-native';

// Staff Tasks — shared display rules (labels, colours, dates, filters,
// notifications). Pure helpers so the list, calendar, details and the
// notification feed all read the same way.

export const TASK_STATUS = {
  ASSIGNED: { label: 'New', color: '#F32C26', bg: '#FEECEC' },
  ACCEPTED: { label: 'Accepted', color: '#035C6C', bg: '#E5F3F5' },
  IN_PROGRESS: { label: 'In Progress', color: '#0788C9', bg: '#E6F3FA' },
  COMPLETED: { label: 'Completed', color: '#609138', bg: '#EEF4E9' },
  UNABLE_TO_COMPLETE: { label: 'Awaiting Review', color: '#F32C26', bg: '#FEECEC' },
  REJECTED: { label: 'Rejected', color: '#F32C26', bg: '#FEECEC' },
  CANCELLED: { label: 'Cancelled', color: '#6B7280', bg: '#F3F4F6' },
};
export const statusMeta = (s) => TASK_STATUS[String(s || '').toUpperCase()] || { label: s || '—', color: '#6B7280', bg: '#F3F4F6' };
// Badge for a task card: an accepted task reads Pending on/after its day and
// Upcoming before it (as in the design); everything else uses statusMeta.
export function displayStatus(t) {
  const st = String(t?.status || '').toUpperCase();
  if (st === 'ACCEPTED') {
    return dayKey(t.startAt) > todayKey()
      ? { label: 'Upcoming', color: '#0788C9', bg: '#E6F3FA' }
      : { label: 'Pending', color: '#FAA700', bg: '#FFF6E0' };
  }
  return statusMeta(st);
}

export const TASK_CATEGORY = {
  // SERVICE / PARCEL: the Partner App's task types.
  SERVICE: { label: 'Service', icon: Wrench, color: '#035C6C' },
  PARCEL: { label: 'Parcel', icon: Package, color: '#609138' },
  DELIVERY: { label: 'Delivery', icon: Truck, color: '#0788C9' },
  SUPPLIER: { label: 'Supplier', icon: ShoppingCart, color: '#FAA700' },
  BANK_WORK: { label: 'Bank Work', icon: Landmark, color: '#1C3053' },
  SHOP_WORK: { label: 'Shop Work', icon: Building2, color: '#1C3053' },
  PICKUP: { label: 'Pickup', icon: Package, color: '#035C6C' },
  PURCHASE: { label: 'Purchase', icon: ShoppingCart, color: '#FAA700' },
  BANK: { label: 'Bank', icon: Landmark, color: '#1C3053' },
  CUSTOMER_VISIT: { label: 'Customer Visit', icon: UserRound, color: '#609138' },
  OFFICE: { label: 'Office', icon: Building2, color: '#1C3053' },
  CLEANING: { label: 'Cleaning', icon: Sparkles, color: '#035C6C' },
  OTHER: { label: 'Other', icon: ClipboardList, color: '#6B7280' },
};
export const categoryMeta = (c) => TASK_CATEGORY[String(c || '').toUpperCase()] || TASK_CATEGORY.OTHER;

export const TASK_PRIORITY = {
  LOW: { label: 'Low', color: '#6B7280' },
  NORMAL: { label: 'Normal', color: '#035C6C' },
  HIGH: { label: 'High', color: '#FAA700' },
  URGENT: { label: 'Urgent', color: '#F32C26' },
};
export const priorityMeta = (p) => TASK_PRIORITY[String(p || '').toUpperCase()] || null;

export const UNABLE_REASONS = [
  { code: 'BUS_UNAVAILABLE', label: 'Bus Unavailable' },
  { code: 'CUSTOMER_UNAVAILABLE', label: 'Customer Unavailable' },
  { code: 'ITEM_UNAVAILABLE', label: 'Item Unavailable' },
  { code: 'SHOP_CLOSED', label: 'Shop Closed' },
  { code: 'TIME_CONSTRAINT', label: 'Time Constraint' },
  { code: 'OTHER', label: 'Other' },
];
export const unableLabel = (code) => UNABLE_REASONS.find((r) => r.code === code)?.label || code || '';

// Finished from the employee's side — nothing left to act on.
export const FINAL_STATUSES = new Set(['COMPLETED', 'CANCELLED', 'REJECTED']);
export const isFinal = (t) => FINAL_STATUSES.has(String(t?.status || '').toUpperCase());

const pad2 = (n) => String(n).padStart(2, '0');
const toDate = (v) => { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };

// "14:05" — 24-hour local time.
export function hhmm(v) {
  const d = toDate(v);
  return d ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : '';
}
// "HH:mm – HH:mm", or just the start.
export function timeRange(t) {
  const a = hhmm(t?.startAt);
  const b = hhmm(t?.endAt);
  return a && b ? `${a} – ${b}` : a;
}
// Local calendar day "YYYY-MM-DD".
export function dayKey(v) {
  const d = v instanceof Date ? v : toDate(v);
  return d ? `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` : '';
}
export const todayKey = () => dayKey(new Date());
// "28 Oct 2026"
export function fmtDay(v) {
  const d = toDate(v);
  return d ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
}
// "Today" / "Tomorrow" / "Yesterday" / "29 Oct"
export function relDay(v) {
  const d = toDate(v);
  if (!d) return '';
  const k = dayKey(d);
  const off = (n) => dayKey(new Date(Date.now() + n * 86400000));
  if (k === off(0)) return 'Today';
  if (k === off(1)) return 'Tomorrow';
  if (k === off(-1)) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}
// "(1h)", "(1h 30m)", "(45m)"
export function durationLabel(t) {
  const a = toDate(t?.startAt);
  const b = toDate(t?.endAt);
  if (!a || !b || b <= a) return '';
  const m = Math.round((b - a) / 60000);
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `(${h ? `${h}h` : ''}${h && r ? ' ' : ''}${r ? `${r}m` : ''})`;
}
// Short task reference: the server's code when it sends one, else from the id.
export const taskCode = (t) => t?.code || (t?.id ? `TSK-${String(t.id).replace(/-/g, '').slice(0, 6).toUpperCase()}` : '');

// "28 Oct 2026 · 14:05"
export function fmtStamp(v) {
  const d = toDate(v);
  return d ? `${fmtDay(d)} · ${hhmm(d)}` : '';
}

export const TASK_FILTERS = ['All', 'Today', 'Upcoming', 'In Progress', 'Completed'];
export function filterTasks(list, filter) {
  const today = todayKey();
  const rows = Array.isArray(list) ? list : [];
  switch (filter) {
    case 'Today': return rows.filter((t) => dayKey(t.startAt) === today);
    case 'Upcoming': return rows.filter((t) => dayKey(t.startAt) > today && !isFinal(t));
    case 'In Progress': return rows.filter((t) => String(t.status).toUpperCase() === 'IN_PROGRESS');
    case 'Completed': return rows.filter((t) => String(t.status).toUpperCase() === 'COMPLETED');
    default: return rows;
  }
}

// Earliest start first (ties: newest update first).
export const byStart = (a, b) => (new Date(a.startAt || 0) - new Date(b.startAt || 0))
  || (new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));

// Checklist progress { done, total, requiredOpen }.
export function checklistProgress(t) {
  const items = Array.isArray(t?.checklist) ? t.checklist : [];
  return {
    done: items.filter((i) => i.done).length,
    total: items.length,
    requiredOpen: items.filter((i) => i.required && !i.done).length,
  };
}

// A server without the staff-task endpoints.
export const isNotAvailable = (e) => e?.status === 404 || e?.status === 501;

// Assigned to this technician (a task can have several assignees).
export const isAssignedTo = (t, techId) => !techId
  || (Array.isArray(t?.assigneeIds) ? t.assigneeIds : [t?.assignedTechnicianId]).map(String).includes(String(techId));

// Notification for a task, from its latest server event (one per event, so
// a re-read never duplicates it), plus a reminder an hour before an open
// task starts. null when there is nothing to tell.
const EVENT_NOTICE = {
  CREATED: 'New Task Assigned',
  ACCEPTED: 'Task Accepted',
  STARTED: 'Task In Progress',
  REASSIGNED: 'Task Reassigned',
  RESCHEDULED: 'Task Rescheduled',
  CANCELLED: 'Task Cancelled',
  OWNER_RESPONSE: 'Owner Response',
  COMPLETED: 'Task Completed',
};
export function taskNotification(t) {
  const ev = t?.lastEvent;
  const type = String(ev?.type || '').toUpperCase();
  const title = EVENT_NOTICE[type];
  if (!title) return null;
  const when = timeRange(t);
  const detail = type === 'OWNER_RESPONSE' && t.ownerResponse ? t.ownerResponse
    : type === 'CANCELLED' ? 'Cancelled by the shop'
    : [fmtDay(t.startAt), when].filter(Boolean).join(' · ');
  return {
    id: `task:${t.id}:${type}:${ev.createdAt || ''}`,
    kind: 'task',
    taskEvent: type,
    title,
    body: [t.title, detail].filter(Boolean).join(' · '),
    createdAt: ev.createdAt || t.updatedAt || t.createdAt,
    taskId: t.id,
  };
}
export function taskReminder(t, now = Date.now()) {
  const st = String(t?.status || '').toUpperCase();
  if (st !== 'ASSIGNED' && st !== 'ACCEPTED') return null;
  const start = toDate(t.startAt);
  if (!start) return null;
  const mins = (start.getTime() - now) / 60000;
  if (mins < 0 || mins > 60) return null;
  return {
    id: `task:${t.id}:REMINDER:${t.startAt}`,
    kind: 'task',
    taskEvent: 'REMINDER',
    title: 'Task Reminder',
    body: `${t.title} · starts at ${hhmm(t.startAt)}`,
    createdAt: new Date(start.getTime() - 60 * 60000).toISOString(),
    taskId: t.id,
  };
}
