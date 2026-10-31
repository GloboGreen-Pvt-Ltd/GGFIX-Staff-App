import { ticketApi } from './client';
import { unableLabel } from '../utils/staffTasks';

// Staff Tasks (general shop tasks assigned by the owner from the Partner App).
// Live contract — ticket-service StaffTaskController (/staff-tasks):
//   GET  /staff-tasks?from&to                  the caller's own tasks (employee)
//   GET  /staff-tasks/{id}                     one task, with its history
//   POST /staff-tasks/{id}/status              { status: IN_PROGRESS | COMPLETED | INCOMPLETE, note }
//   POST /staff-tasks/{id}/checklist/{itemId}/toggle
// Server rows are mapped to the app's task shape here, so every screen reads
// one model. Nothing is shown as done before the call returns.

// Server status → app status. The server has no accept step: a PENDING task
// reads as accepted (Start / Unable). INCOMPLETE waits for the owner's review.
const STATUS = {
  PENDING: 'ACCEPTED', IN_PROGRESS: 'IN_PROGRESS', COMPLETED: 'COMPLETED', INCOMPLETE: 'UNABLE_TO_COMPLETE', CANCELLED: 'CANCELLED',
};
// History action → app event type (others keep their name).
const EVENT = { IN_PROGRESS: 'STARTED', INCOMPLETE: 'UNABLE_TO_COMPLETE', EDITED: 'UPDATED', PENDING: 'REOPENED' };
const PRIORITY = { MEDIUM: 'NORMAL' };
const ACTOR = { OWNER: 'Shop Owner', EMPLOYEE: 'Employee' };

const up = (v) => String(v || '').trim().toUpperCase();
const iso = (v) => {
  if (v == null || v === '') return null;
  const d = new Date(typeof v === 'number' && v < 1e12 ? v * 1000 : v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
// "2026-10-28" + "14:05" → that local (shop) time as ISO.
const at = (date, time) => {
  const [y, m, d] = String(date || '').split('-').map(Number);
  const [hh, mm] = String(time || '').split(':').map(Number);
  return y && m && d ? new Date(y, m - 1, d, hh || 0, mm || 0).toISOString() : null;
};

function toTask(r) {
  if (!r || typeof r !== 'object' || !r.id) return null;
  const events = (Array.isArray(r.history) ? r.history : []).map((h, i) => ({
    id: `${r.id}:${i}`,
    type: EVENT[up(h?.action)] || up(h?.action),
    note: h?.note || '',
    actorName: ACTOR[up(h?.by)] || '',
    createdAt: iso(h?.at),
  }));
  const lastAt = (type) => [...events].reverse().find((e) => e.type === type)?.createdAt || null;
  const assignees = Array.isArray(r.assignees) ? r.assignees : [];
  const status = STATUS[up(r.status)] || up(r.status);
  return {
    id: r.id,
    title: r.title || '',
    description: r.description || '',
    category: up(r.type) || 'OTHER',
    priority: PRIORITY[up(r.priority)] || up(r.priority) || 'NORMAL',
    status,
    startAt: at(r.date, r.startTime),
    endAt: at(r.date, r.endTime),
    reminder: r.reminder ?? 0,
    assignees,
    assigneeIds: assignees.map((a) => String(a?.id)),
    assignedTechnicianId: assignees[0]?.id || null,
    locationAddress: r.location || '',
    latitude: r.coords?.latitude ?? null,
    longitude: r.coords?.longitude ?? null,
    checklist: (Array.isArray(r.checklist) ? r.checklist : []).map((c) => ({ id: c.id, label: c.text || '', done: !!c.done, required: false })),
    // INCOMPLETE always carries the employee's reason (the server requires one).
    unableReasonCode: status === 'UNABLE_TO_COMPLETE' ? (r.incompleteReason || 'Not completed') : null,
    startedAt: lastAt('STARTED'),
    completedAt: status === 'COMPLETED' ? lastAt('COMPLETED') : null,
    cancelledAt: status === 'CANCELLED' ? lastAt('CANCELLED') : null,
    evidence: [],
    canAddEvidence: false, // no proof-photo endpoint on the server yet
    events,
    lastEvent: events[events.length - 1] || null,
    createdAt: iso(r.createdAt) || events[0]?.createdAt || null,
    updatedAt: iso(r.updatedAt),
  };
}

const rowsOf = (res) => (Array.isArray(res) ? res : (Array.isArray(res?.content) ? res.content : [])).map(toTask).filter(Boolean);

// Caller's tasks; from / to are YYYY-MM-DD (task date, shop time). `status`
// (app statuses) filters on the device — the server has no status filter.
export async function listMyStaffTasks({ from, to, status } = {}) {
  const rows = rowsOf(await ticketApi.get('/staff-tasks', { query: { from, to } }));
  if (!status) return rows;
  const want = new Set((Array.isArray(status) ? status : String(status).split(',')).map(up));
  return rows.filter((t) => want.has(t.status));
}

export async function getStaffTask(taskId) {
  return toTask(await ticketApi.get(`/staff-tasks/${taskId}`));
}

// The activity trail comes with the task (its history).
export async function listStaffTaskEvents(taskId) {
  return (await getStaffTask(taskId))?.events || [];
}

const setStatus = async (taskId, status, note) => toTask(
  await ticketApi.post(`/staff-tasks/${taskId}/status`, { body: { status, note: note || undefined } }),
);

export const startStaffTask = (taskId) => setStatus(taskId, 'IN_PROGRESS');

export const completeStaffTask = (taskId, note) => setStatus(taskId, 'COMPLETED', note);

// Saved as one reason line, e.g. "Shop Closed — opens at 4".
export function unableStaffTask(taskId, { reasonCode, note } = {}) {
  const label = reasonCode && reasonCode !== 'OTHER' ? unableLabel(reasonCode) : '';
  return setStatus(taskId, 'INCOMPLETE', [label, String(note || '').trim()].filter(Boolean).join(' — '));
}

// The server toggles, so flip only when the item isn't already as wanted
// (the owner may have changed it meanwhile).
export async function setStaffTaskChecklistItem(taskId, itemId, done) {
  const cur = await getStaffTask(taskId);
  const item = cur?.checklist.find((i) => String(i.id) === String(itemId));
  if (item && item.done === !!done) return cur;
  return toTask(await ticketApi.post(`/staff-tasks/${taskId}/checklist/${encodeURIComponent(itemId)}/toggle`));
}

// No proof-photo endpoint on the server yet (TaskDetails hides "Add Update").
export async function addStaffTaskEvidence() {
  const err = new Error('This feature is currently unavailable.');
  err.status = 501;
  throw err;
}
