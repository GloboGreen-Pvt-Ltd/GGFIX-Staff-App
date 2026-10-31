import React, { useCallback, useRef, useState } from 'react';
import {
  View, ScrollView, TouchableOpacity, ActivityIndicator, Image, Modal, Pressable, Linking, AppState, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import {
  Calendar, Clock, MapPin, Navigation, Check, CircleCheck, CircleX, CirclePlay, ImagePlus, X, Square, Info as InfoIcon,
} from 'lucide-react-native';
import { Text, TextInput } from '../components/Typography';
import MintScreenHeader from '../components/MintScreenHeader';
import ImageViewerModal from '../components/ImageViewerModal';
import { confirm, notify } from '../components/confirm';
import { selectTechnicianId } from '../store/authSlice';
import {
  getStaffTask, startStaffTask, setStaffTaskChecklistItem, completeStaffTask, unableStaffTask,
} from '../api/staffTasks';
import {
  categoryMeta, displayStatus, fmtDay, fmtStamp, timeRange, checklistProgress, durationLabel, relDay, hhmm, taskCode,
  UNABLE_REASONS, unableLabel, isNotAvailable, isAssignedTo,
} from '../utils/staffTasks';
import { rf, rs, sheetWidth } from '../utils/responsive';
import { userMessage } from '../utils/userMessages';

const SYNC_MS = 15000;

const EVENT_LABEL = {
  CREATED: 'Task assigned', ACCEPTED: 'Accepted', REJECTED: 'Rejected', STARTED: 'Started',
  CHECKLIST_UPDATED: 'Checklist updated', EVIDENCE_ADDED: 'Proof added', COMPLETED: 'Completed',
  UNABLE_TO_COMPLETE: 'Unable to complete', UPDATED: 'Details updated', RESCHEDULED: 'Rescheduled',
  REASSIGNED: 'Reassigned', CANCELLED: 'Cancelled', OWNER_RESPONSE: 'Owner response', REOPENED: 'Reopened',
};

// A returned body is the updated task when it carries an id; otherwise re-read.
const asTask = (res) => (res && typeof res === 'object' && res.id ? res : null);

export default function TaskDetailsScreen({ navigation, route }) {
  const taskId = route?.params?.taskId;
  const technicianId = useSelector(selectTechnicianId);
  const [task, setTask] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null); // action key while a call is in flight
  const [sync, setSync] = useState({ status: 'idle', at: null });
  const [unableOpen, setUnableOpen] = useState(false);
  const [unableCode, setUnableCode] = useState('');
  const [unableNote, setUnableNote] = useState('');
  const [donePopup, setDonePopup] = useState(false);
  const [photoAt, setPhotoAt] = useState(-1);
  const inFlight = useRef(false);

  const load = useCallback(async () => {
    if (!taskId) return;
    try {
      const t = await getStaffTask(taskId);
      setTask(t);
      setEvents(t?.events || []);
      setError(null);
      setSync({ status: 'synced', at: new Date() });
    } catch (e) {
      setError(isNotAvailable(e) ? 'unavailable' : userMessage(e, 'Could not load task'));
      setSync({ status: 'failed', at: null });
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useFocusEffect(useCallback(() => {
    load();
    const id = setInterval(() => { if (AppState.currentState === 'active' && !inFlight.current) load(); }, SYNC_MS);
    return () => clearInterval(id);
  }, [load]));

  // Runs one server action; the screen changes only after the backend confirms.
  const run = useCallback(async (key, request, { onDone, failTitle = 'Could not save', successTitle } = {}) => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(key);
    setSync({ status: 'saving', at: null });
    try {
      const res = await request();
      const next = asTask(res);
      if (next) { setTask(next); setEvents(next.events || []); } else await load();
      setSync({ status: 'synced', at: new Date() });
      onDone?.(next);
      if (successTitle) notify(successTitle, '', { type: 'success' });
      return true;
    } catch (e) {
      setSync({ status: 'failed', at: null });
      notify(failTitle, userMessage(e, 'Please try again.'), { type: 'error' });
      return false;
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }, [load]);

  if (loading && !task) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <MintScreenHeader title="Task Details" navigation={navigation} />
        <ActivityIndicator color="#035C6C" style={{ marginTop: rs(40) }} />
      </SafeAreaView>
    );
  }
  if (!task) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <MintScreenHeader title="Task Details" navigation={navigation} />
        <View style={s.state}>
          <CircleX size={rs(26)} color="#6B7280" />
          <Text style={s.stateText}>{error === 'unavailable' ? 'Staff Tasks is not enabled on your shop server yet.' : (error || 'Task not found.')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const st = String(task.status || '').toUpperCase();
  const cat = categoryMeta(task.category);
  const CatIcon = cat.icon;
  const sm = displayStatus(task);
  const prio = String(task.priority || 'NORMAL').toUpperCase();
  const prog = checklistProgress(task);
  const photos = (Array.isArray(task.evidence) ? task.evidence : []).filter((e) => e?.url);
  const notes = (Array.isArray(task.evidence) ? task.evidence : []).filter((e) => e?.note);
  // Server enforces it too; the screen goes read-only for anyone else.
  const notMine = !isAssignedTo(task, technicianId);
  const canAct = !notMine;
  const canAddProof = canAct && task.canAddEvidence !== false && ['ACCEPTED', 'IN_PROGRESS', 'UNABLE_TO_COMPLETE'].includes(st);

  const openMaps = () => {
    const q = task.latitude != null && task.longitude != null
      ? `${task.latitude},${task.longitude}`
      : encodeURIComponent([task.locationName, task.locationAddress].filter(Boolean).join(', '));
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`).catch(() => notify('Could not open Maps', 'No maps app is available.', { type: 'error' }));
  };

  const onStart = async () => {
    const ok = await confirm({ title: 'Start task?', message: 'This records the start time and shows the task as In Progress to the shop.', confirmText: 'Start Task' });
    if (ok) run('start', () => startStaffTask(task.id), { failTitle: 'Could not start task', successTitle: 'Task started' });
  };
  const onToggle = (item) => {
    if (!canAct || st !== 'IN_PROGRESS') return;
    run(`item:${item.id}`, () => setStaffTaskChecklistItem(task.id, item.id, !item.done), { failTitle: 'Checklist not saved', successTitle: 'Checklist updated' });
  };
  const onComplete = async () => {
    if (prog.requiredOpen > 0) { notify('Checklist incomplete', `Tick the ${prog.requiredOpen} required item${prog.requiredOpen === 1 ? '' : 's'} first.`, { type: 'warning' }); return; }
    if (task.requiresProof && photos.length === 0) {
      notify('Proof required', 'Add at least one proof photo before completing this task.', { type: 'warning' });
      navigation.navigate('TaskUpdate', { taskId: task.id });
      return;
    }
    const ok = await confirm({ title: 'Complete task?', message: 'The shop will see this task as Completed.', confirmText: 'Complete Task' });
    if (!ok) return;
    run('complete', () => completeStaffTask(task.id), {
      failTitle: 'Could not complete task',
      // Success shows the Task Completed popup (no toast).
      onDone: () => setDonePopup(true),
    });
  };
  const onUnable = async () => {
    if (!unableCode) { notify('Select a reason', 'Pick why the task could not be completed.', { type: 'warning' }); return; }
    if (unableCode === 'OTHER' && !unableNote.trim()) { notify('Add a note', 'Describe the reason.', { type: 'warning' }); return; }
    const ok = await run('unable', () => unableStaffTask(task.id, { reasonCode: unableCode, note: unableNote.trim() }), { failTitle: 'Could not submit reason', successTitle: 'Reason submitted' });
    if (ok) { setUnableOpen(false); setUnableCode(''); setUnableNote(''); }
  };

  const syncBadge = sync.status === 'saving' ? { t: 'Saving…', c: '#FAA700' }
    : sync.status === 'failed' ? { t: 'Sync failed', c: '#F32C26' }
    : sync.at ? { t: `Synced ${sync.at.getHours().toString().padStart(2, '0')}:${sync.at.getMinutes().toString().padStart(2, '0')}`, c: '#609138' } : null;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <MintScreenHeader
        title="Task Details"
        navigation={navigation}
        right={syncBadge ? (
          <TouchableOpacity onPress={load} disabled={sync.status === 'saving'} style={s.syncPill} accessibilityLabel={`Sync status: ${syncBadge.t}`}>
            <View style={[s.syncDot, { backgroundColor: syncBadge.c }]} />
            <Text style={[s.syncText, { color: syncBadge.c }]}>{syncBadge.t}</Text>
          </TouchableOpacity>
        ) : null}
      />
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Title, category, status, priority */}
        <View style={s.card}>
          <View style={s.row}>
            <View style={[s.iconTile, { backgroundColor: `${cat.color}1A` }]}>
              <View style={[s.catCircle, { backgroundColor: cat.color }]}><CatIcon size={rs(16)} color="#FFFFFF" strokeWidth={2.3} /></View>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.title}>{task.title}</Text>
              <Text style={s.muted}>ID: {taskCode(task)} · {cat.label}</Text>
            </View>
            <View style={[s.badge, { backgroundColor: sm.bg }]}><Text style={[s.badgeText, { color: sm.color }]}>{sm.label}</Text></View>
          </View>
          {notMine ? <Text style={[s.small, { color: '#F32C26', marginTop: rs(6) }]}>This task is not assigned to you — view only.</Text> : null}

          {/* Date · time (duration) · location + Open in Maps */}
          <View style={s.divider} />
          <Line icon={Calendar} text={fmtDay(task.startAt)} />
          <Line icon={Clock} text={[timeRange(task) || '—', durationLabel(task)].filter(Boolean).join(' ')} />
          {task.locationName || task.locationAddress ? (
            <>
              <Line icon={MapPin} text={[task.locationName, task.locationAddress].filter(Boolean).join(', ')} />
              <TouchableOpacity onPress={openMaps} style={s.mapsBtn} accessibilityRole="button" accessibilityLabel="Open in Maps">
                <Navigation size={rs(12)} color="#035C6C" strokeWidth={2.4} />
                <Text style={s.mapsText}>Open in Maps</Text>
              </TouchableOpacity>
            </>
          ) : null}
          {task.startedAt ? <Line icon={CirclePlay} text={`Started ${fmtStamp(task.startedAt)}`} /> : null}
          {task.completedAt ? <Line icon={CircleCheck} text={`Completed ${fmtStamp(task.completedAt)}`} /> : null}
        </View>

        {task.description ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Description</Text>
            <Text style={s.body}>{task.description}</Text>
          </View>
        ) : null}

        {/* Assigned by + priority (design) */}
        <View style={s.card}>
          <Text style={s.cardTitle}>Assigned by</Text>
          <View style={s.row}>
            <View style={s.avatar}><Text style={s.avatarText}>{String(task.assignedByName || 'S').trim().charAt(0).toUpperCase()}</Text></View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.infoValue}>{task.assignedByName || 'Shop Owner'}</Text>
              {task.createdAt ? <Text style={s.small}>{relDay(task.createdAt)}, {hhmm(task.createdAt)}</Text> : null}
            </View>
          </View>
          <Text style={[s.cardTitle, { marginTop: rs(10) }]}>Priority</Text>
          <View style={s.prioRow}>
            {[
              { key: 'LOW', label: 'Low', color: '#6B7280' },
              { key: 'NORMAL', label: 'Medium', color: '#FAA700' },
              { key: prio === 'URGENT' ? 'URGENT' : 'HIGH', label: prio === 'URGENT' ? 'Urgent' : 'High', color: '#F32C26' },
            ].map((p) => {
              const on = prio === p.key;
              return (
                <View key={p.key} style={[s.prioChip, on && { borderColor: p.color, backgroundColor: `${p.color}14` }]}>
                  <View style={[s.prioDot, { backgroundColor: on ? p.color : '#C9CDD2' }]} />
                  <Text style={[s.prioText, on && { color: p.color }]}>{p.label}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Outcome details */}
        {task.rejectReason || task.unableReasonCode || task.ownerResponse || st === 'CANCELLED' ? (
          <View style={[s.card, { borderColor: sm.bg }]}>
            {task.rejectReason ? <><Text style={s.cardTitle}>Rejected</Text><Text style={s.body}>{task.rejectReason}</Text></> : null}
            {task.unableReasonCode ? (
              <>
                <Text style={s.cardTitle}>Unable to complete · awaiting owner review</Text>
                <Text style={s.body}>{unableLabel(task.unableReasonCode)}{task.unableNote ? ` — ${task.unableNote}` : ''}</Text>
              </>
            ) : null}
            {task.ownerResponse ? <><Text style={[s.cardTitle, { marginTop: rs(6) }]}>Owner response</Text><Text style={s.body}>{task.ownerResponse}</Text></> : null}
            {st === 'CANCELLED' ? <Text style={s.body}>This task was cancelled by the shop{task.cancelledAt ? ` · ${fmtStamp(task.cancelledAt)}` : ''}.</Text> : null}
          </View>
        ) : null}

        {/* Checklist */}
        {prog.total ? (
          <View style={s.card}>
            <View style={s.rowBetween}>
              <Text style={s.cardTitle}>Checklist ({prog.done}/{prog.total})</Text>
              <Text style={[s.small, { fontWeight: '800', color: '#035C6C' }]}>{Math.round((prog.done / prog.total) * 100)}%</Text>
            </View>
            <View style={s.progressTrack}><View style={[s.progressFill, { width: `${Math.round((prog.done / prog.total) * 100)}%` }]} /></View>
            {task.checklist.map((item) => {
              const itemBusy = busy === `item:${item.id}`;
              const editable = canAct && st === 'IN_PROGRESS';
              return (
                <TouchableOpacity key={item.id} onPress={() => onToggle(item)} disabled={!editable || !!busy} activeOpacity={0.8} style={s.checkRow}
                  accessibilityRole="checkbox" accessibilityState={{ checked: !!item.done, disabled: !editable }}>
                  {itemBusy ? <ActivityIndicator size="small" color="#035C6C" />
                    : item.done ? <View style={s.checkOn}><Check size={rs(12)} color="#FFFFFF" strokeWidth={3} /></View>
                    : <Square size={rs(18)} color={editable ? '#035C6C' : '#C9CDD2'} strokeWidth={2} />}
                  <Text style={[s.checkText, item.done && { color: '#6B7280', textDecorationLine: 'line-through' }]}>
                    {item.label}{item.required ? <Text style={{ color: '#F32C26' }}> *</Text> : null}
                  </Text>
                </TouchableOpacity>
              );
            })}
            {st === 'ACCEPTED' && canAct ? <Text style={s.small}>Start the task to tick items.</Text> : null}
          </View>
        ) : null}

        {/* Proof photos and notes */}
        {photos.length || notes.length || canAddProof ? (
          <View style={s.card}>
            <View style={s.rowBetween}>
              <Text style={s.cardTitle}>Updates & Proof{task.requiresProof ? <Text style={{ color: '#F32C26' }}> *</Text> : null}</Text>
              {canAddProof ? (
                <TouchableOpacity onPress={() => navigation.navigate('TaskUpdate', { taskId: task.id })} style={s.linkBtn} accessibilityRole="button">
                  <ImagePlus size={rs(13)} color="#035C6C" strokeWidth={2.4} />
                  <Text style={s.linkText}>Add Update</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {photos.length ? (
              <View style={s.photoGrid}>
                {photos.map((p, i) => (
                  <Pressable key={p.id || p.url} onPress={() => setPhotoAt(i)} accessibilityLabel={`Proof photo ${i + 1}`}>
                    <Image source={{ uri: p.url }} style={s.photo} />
                  </Pressable>
                ))}
              </View>
            ) : <Text style={s.small}>No photos yet.</Text>}
            {notes.map((n) => (
              <Text key={`n-${n.id}`} style={[s.body, { marginTop: rs(4) }]}>• {n.note}{n.uploadedAt ? <Text style={s.small}>  {fmtStamp(n.uploadedAt)}</Text> : null}</Text>
            ))}
          </View>
        ) : null}

        {/* Activity — the shared audit trail */}
        {events.length ? (
          <View style={s.card}>
            <Text style={s.cardTitle}>Activity</Text>
            {events.map((e, i) => (
              <View key={e.id || i} style={s.eventRow}>
                <View style={s.eventDot} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.eventTitle}>{EVENT_LABEL[String(e.type).toUpperCase()] || e.type}{e.actorName ? ` · ${e.actorName}` : ''}</Text>
                  {e.note ? <Text style={s.small}>{e.note}</Text> : null}
                  <Text style={s.small}>{fmtStamp(e.createdAt)}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {/* Actions for the current step */}
      {canAct && ['ACCEPTED', 'IN_PROGRESS'].includes(st) ? (
        <View style={s.actionBar}>
          {st === 'ACCEPTED' ? (
            <>
              <ActionBtn label="Unable" icon={CircleX} tone="red" outline onPress={() => setUnableOpen(true)} disabled={!!busy} />
              <ActionBtn label="Start Task" icon={CirclePlay} tone="teal" onPress={onStart} busy={busy === 'start'} disabled={!!busy} />
            </>
          ) : (
            <>
              <ActionBtn label="Unable" icon={CircleX} tone="red" outline onPress={() => setUnableOpen(true)} disabled={!!busy} />
              <ActionBtn label="Complete" icon={CircleCheck} tone="green" onPress={onComplete} busy={busy === 'complete'} disabled={!!busy} />
            </>
          )}
        </View>
      ) : null}

      {/* Unable to Complete — reason required, notes optional (required for Other) */}
      <Sheet visible={unableOpen} onClose={() => !busy && setUnableOpen(false)} title="Unable to complete">
        <Text style={s.fieldLabel}>Reason <Text style={{ color: '#F32C26' }}>*</Text></Text>
        <View style={s.chips}>
          {UNABLE_REASONS.map((r) => {
            const on = unableCode === r.code;
            return (
              <TouchableOpacity key={r.code} onPress={() => setUnableCode(on ? '' : r.code)} style={[s.chip, on && s.chipOn]} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                <Text style={[s.chipText, on && { color: '#FFFFFF' }]}>{r.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={s.fieldLabel}>Notes{unableCode === 'OTHER' ? <Text style={{ color: '#F32C26' }}> *</Text> : ' (optional)'}</Text>
        <TextInput value={unableNote} onChangeText={setUnableNote} multiline placeholder="Add details for the shop owner" placeholderTextColor="#9CA3AF" style={s.input} editable={!busy} />
        <Text style={s.small}>The owner will review it and can reschedule, reassign or cancel the task.</Text>
        <View style={s.sheetBtns}>
          <ActionBtn label="Cancel" tone="teal" outline onPress={() => setUnableOpen(false)} disabled={!!busy} />
          <ActionBtn label="Submit" tone="red" onPress={onUnable} busy={busy === 'unable'} disabled={!!busy || !unableCode} />
        </View>
      </Sheet>

      {/* Shown only after the server confirmed the completion */}
      <Modal visible={donePopup} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={s.popupBackdrop}>
          <View style={[s.popup, sheetWidth]}>
            {/* a few brand-colour confetti dots */}
            {[['#FAA700', 8, 24], ['#0788C9', 22, 78], ['#F32C26', 50, 14], ['#609138', 14, 86], ['#035C6C', 46, 90]].map(([c, top, left], i) => (
              <View key={i} style={[s.confetti, { backgroundColor: c, top, left: `${left}%` }]} />
            ))}
            <View style={s.popupIcon}><Check size={rs(34)} color="#FFFFFF" strokeWidth={3} /></View>
            <Text style={s.popupTitle}>Task Completed!</Text>
            <Text style={s.popupTask}>{task.title}</Text>
            <Text style={s.small}>{fmtDay(task.startAt)} • {timeRange(task)}</Text>
            <View style={s.popupInfo}>
              <InfoIcon size={rs(14)} color="#0788C9" />
              <Text style={s.popupInfoText}>Task has been updated to the shop owner.</Text>
            </View>
            <TouchableOpacity
              onPress={() => { setDonePopup(false); navigation.navigate('MyTasks', { filter: 'Completed', refreshAt: Date.now() }); }}
              style={s.popupBtn}
              accessibilityRole="button"
            >
              <Text style={s.popupBtnText}>Back to My Tasks</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <ImageViewerModal
        visible={photoAt >= 0}
        images={photos.map((p, i) => ({ uri: p.url, label: `Proof photo ${i + 1}` }))}
        index={photoAt < 0 ? 0 : photoAt}
        onClose={() => setPhotoAt(-1)}
      />
    </SafeAreaView>
  );
}

function Line({ icon: Icon, text }) {
  return (
    <View style={s.lineRow}>
      <Icon size={rs(14)} color="#6B7280" />
      <Text style={s.lineText}>{text}</Text>
    </View>
  );
}

const TONE = { teal: '#035C6C', green: '#609138', red: '#F32C26' };
function ActionBtn({ label, icon: Icon, tone, outline, onPress, busy, disabled }) {
  const c = TONE[tone] || TONE.teal;
  const fg = outline ? c : '#FFFFFF';
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.85} accessibilityRole="button"
      style={[s.btn, outline ? { borderWidth: 1.5, borderColor: c, backgroundColor: '#FFFFFF' } : { backgroundColor: c }, disabled && !busy && { opacity: 0.5 }]}>
      {busy ? <ActivityIndicator size="small" color={fg} /> : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: rs(6) }}>
          {Icon ? <Icon size={rs(15)} color={fg} strokeWidth={2.4} /> : null}
          <Text style={[s.btnText, { color: fg }]}>{label}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function Sheet({ visible, onClose, title, children }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.sheetBackdrop} onPress={onClose}>
        <Pressable style={[s.sheet, sheetWidth]} onPress={() => {}}>
          <View style={s.rowBetween}>
            <Text style={s.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityLabel="Close"><X size={rs(18)} color="#6B7280" /></TouchableOpacity>
          </View>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F4F6' },
  content: { padding: rs(12), paddingBottom: rs(24) },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: rs(14), borderWidth: 1, borderColor: '#E5E7EB', padding: rs(10), marginBottom: rs(8),
    shadowColor: '#111111', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: rs(8) },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: rs(8) },
  iconTile: { width: rs(46), height: rs(46), borderRadius: rs(12), alignItems: 'center', justifyContent: 'center' },
  catCircle: { width: rs(34), height: rs(34), borderRadius: rs(17), alignItems: 'center', justifyContent: 'center' },
  divider: { height: 1, backgroundColor: '#EEF0F2', marginVertical: rs(8) },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: rs(8), paddingVertical: rs(4) },
  lineText: { flex: 1, fontSize: rf(12.5), color: '#111111' },
  avatar: { width: rs(36), height: rs(36), borderRadius: rs(18), backgroundColor: '#1C3053', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: rf(15), fontWeight: '800', color: '#FFFFFF' },
  prioRow: { flexDirection: 'row', gap: rs(8), flexWrap: 'wrap' },
  prioChip: { flexDirection: 'row', alignItems: 'center', gap: rs(5), borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', borderRadius: rs(10), paddingHorizontal: rs(12), paddingVertical: rs(6) },
  prioDot: { width: rs(8), height: rs(8), borderRadius: rs(4) },
  prioText: { fontSize: rf(12), fontWeight: '700', color: '#6B7280' },
  title: { fontSize: rf(15), fontWeight: '800', color: '#111111' },
  muted: { fontSize: rf(12), color: '#6B7280', marginTop: 1 },
  small: { fontSize: rf(11), color: '#6B7280' },
  badge: { borderRadius: 999, paddingHorizontal: rs(9), paddingVertical: rs(3) },
  badgeText: { fontSize: rf(10.5), fontWeight: '800' },
  cardTitle: { fontSize: rf(13), fontWeight: '800', color: '#1C3053', marginBottom: rs(4) },
  body: { fontSize: rf(12.5), color: '#111111' },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: rs(8), paddingVertical: rs(4) },
  infoLabel: { fontSize: rf(10.5), color: '#6B7280' },
  infoValue: { fontSize: rf(12.5), color: '#111111', fontWeight: '600' },
  mapsBtn: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-end', gap: rs(4), borderWidth: 1, borderColor: '#035C6C', backgroundColor: '#FFFFFF', borderRadius: rs(10), paddingHorizontal: rs(10), paddingVertical: rs(5), marginTop: rs(4) },
  mapsText: { fontSize: rf(11), fontWeight: '800', color: '#035C6C' },
  progressTrack: { height: rs(6), borderRadius: 999, backgroundColor: '#E5E7EB', overflow: 'hidden', marginBottom: rs(6) },
  progressFill: { height: '100%', backgroundColor: '#035C6C', borderRadius: 999 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: rs(9), paddingVertical: rs(6), minHeight: rs(34) },
  checkOn: { width: rs(18), height: rs(18), borderRadius: rs(4), backgroundColor: '#609138', alignItems: 'center', justifyContent: 'center' },
  checkText: { flex: 1, fontSize: rf(12.5), color: '#111111' },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: rs(4), backgroundColor: '#E5F3F5', borderRadius: 999, paddingHorizontal: rs(9), paddingVertical: rs(4) },
  linkText: { fontSize: rf(11), fontWeight: '800', color: '#035C6C' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(6), marginTop: rs(4) },
  photo: { width: rs(66), height: rs(66), borderRadius: rs(10), backgroundColor: '#F3F4F6' },
  eventRow: { flexDirection: 'row', gap: rs(8), paddingVertical: rs(4) },
  eventDot: { width: rs(8), height: rs(8), borderRadius: rs(4), backgroundColor: '#035C6C', marginTop: rs(5) },
  eventTitle: { fontSize: rf(12), fontWeight: '700', color: '#111111' },
  actionBar: { flexDirection: 'row', gap: rs(8), padding: rs(10), backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  btn: { flex: 1, minHeight: rs(44), borderRadius: rs(12), alignItems: 'center', justifyContent: 'center', paddingHorizontal: rs(10) },
  btnText: { fontSize: rf(13.5), fontWeight: '800' },
  syncPill: { flexDirection: 'row', alignItems: 'center', gap: rs(4), backgroundColor: '#FFFFFF', borderRadius: 999, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: rs(7), paddingVertical: rs(3) },
  syncDot: { width: 6, height: 6, borderRadius: 3 },
  syncText: { fontSize: rf(10), fontWeight: '700' },
  state: { alignItems: 'center', padding: rs(30), gap: rs(8) },
  stateText: { fontSize: rf(12.5), color: '#6B7280', textAlign: 'center' },
  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(17,17,17,0.4)', justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', backgroundColor: '#FFFFFF', borderTopLeftRadius: rs(18), borderTopRightRadius: rs(18), padding: rs(14), paddingBottom: rs(24) },
  sheetTitle: { fontSize: rf(15), fontWeight: '800', color: '#1C3053' },
  fieldLabel: { fontSize: rf(11), fontWeight: '800', color: '#6B7280', marginTop: rs(10), marginBottom: rs(5) },
  input: { minHeight: rs(64), borderWidth: 1, borderColor: '#E5E7EB', borderRadius: rs(10), padding: rs(9), fontSize: rf(12.5), color: '#111111', textAlignVertical: 'top', backgroundColor: '#F9FAFB' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(6) },
  chip: { borderWidth: 1, borderColor: '#FBD0D0', backgroundColor: '#FFFFFF', borderRadius: 999, paddingHorizontal: rs(11), paddingVertical: rs(5) },
  chipOn: { backgroundColor: '#F32C26', borderColor: '#F32C26' },
  chipText: { fontSize: rf(11.5), fontWeight: '700', color: '#111111' },
  sheetBtns: { flexDirection: 'row', gap: rs(8), marginTop: rs(14) },
  popupBackdrop: { flex: 1, backgroundColor: 'rgba(17,17,17,0.45)', alignItems: 'center', justifyContent: 'center', padding: rs(24) },
  popup: { width: '100%', backgroundColor: '#FFFFFF', borderRadius: rs(18), padding: rs(20), paddingTop: rs(30), alignItems: 'center', gap: rs(6), overflow: 'hidden' },
  confetti: { position: 'absolute', width: rs(7), height: rs(7), borderRadius: rs(2), transform: [{ rotate: '35deg' }] },
  popupIcon: { width: rs(70), height: rs(70), borderRadius: rs(35), backgroundColor: '#609138', alignItems: 'center', justifyContent: 'center', marginBottom: rs(6), borderWidth: 5, borderColor: '#EEF4E9' },
  popupTitle: { fontSize: rf(19), fontWeight: '800', color: '#111111' },
  popupTask: { fontSize: rf(14), fontWeight: '700', color: '#1C3053' },
  popupInfo: { flexDirection: 'row', alignItems: 'center', gap: rs(6), alignSelf: 'stretch', backgroundColor: '#E6F3FA', borderRadius: rs(10), padding: rs(10), marginTop: rs(10) },
  popupInfoText: { flex: 1, fontSize: rf(12), color: '#0788C9', fontWeight: '600' },
  popupBtn: { alignSelf: 'stretch', minHeight: rs(44), borderRadius: rs(12), backgroundColor: '#035C6C', alignItems: 'center', justifyContent: 'center', marginTop: rs(10) },
  popupBtnText: { fontSize: rf(13.5), fontWeight: '800', color: '#FFFFFF' },
});
