import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  RefreshControl,
  Modal,
  PanResponder,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text, TextInput } from '../components/Typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  CirclePlay,
  CircleCheck,
  Coffee,
  LogIn,
  LogOut,
  ArrowLeftRight,
  X,
} from 'lucide-react-native';
import { useSelector } from 'react-redux';
import { ticketApi } from '../api/client';
import { listMyTickets } from '../api/tickets';
import { applyEmployeeLeave } from '../api/technician';
import { listModelsForBrand } from '../api/master';
import { useTechnicianIdState } from '../auth/useTechnicianId';
import TechIdPending from '../components/TechIdPending';
import MintScreenHeader from '../components/MintScreenHeader';
import { GradientFill, toneOf, LeftVerticalSidebar, SidebarLayout, useSidebarWidth } from '../components/JobCardKit';
import TimePickerField, { to12h } from '../components/TimePickerField';
import DatePickerField from '../components/DatePickerField';
import { notify } from '../components/confirm';
import { selectSession } from '../store/authSlice';
import { effectiveLateMinutes } from './DailyAttendanceScreen';
import { rf, rs } from '../utils/responsive';
import { useBreak, formatMinutes } from '../utils/breakTracker';

const fmtClock = (ms) => { if (!ms) return '—'; const d = new Date(ms); const h = d.getHours(); return `${String(h % 12 || 12).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
import { resolveDeviceImageSource } from '../utils/images';

const C = {
  green: '#035C6C',
  mint: '#E5F3F5',
  mintBorder: '#E5F3F5',
  red: '#F32C26',
  softRed: '#FEECEC',
  redBorder: '#FBD0D0',
  blue: '#0788C9',
  softBlue: '#E6F3FA',
  yellow: '#FAA700',
  softYellow: '#FDF6E0',
  ink: '#111111',
  muted: '#6B7280',
  faint: '#A3A3A3',
  bg: '#F3F4F6',
  card: '#FFFFFF',
  border: '#E5E7EB',
  grey: '#F3F4F6',
  white: '#FFFFFF',
};
const MAX_CONTENT_WIDTH = 720;

// Duty window fallbacks (used when the technician's profile has no
// defaultCheckIn / defaultCheckOut) — same defaults as DailyAttendanceScreen.
const DEFAULT_DUTY_CHECK_IN = '09:30:00';
const DEFAULT_DUTY_CHECK_OUT = '18:30:00';

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const OFF_STATUSES = new Set(['WEEK_OFF', 'HOLIDAY', 'LEAVE']);
const FINAL_TICKET_STATUSES = new Set(['DELIVERED', 'CANCELLED']);

function pad2(n) {
  return String(n).padStart(2, '0');
}

function ampmOf(h24) {
  return h24 >= 12 ? 'PM' : 'AM';
}

function parseTime(t) {
  if (!t || typeof t !== 'string') return null;
  const [hh, mm] = t.split(':');
  const hour = Number(hh);
  const minute = Number(mm || 0);
  if (Number.isNaN(hour)) return null;
  const h12 = ((hour + 11) % 12) + 1;
  return { hour, minute, mins: hour * 60 + minute, hhmm: `${pad2(hour)}:${pad2(minute)}`, label: `${pad2(h12)}:${pad2(minute)} ${ampmOf(hour)}` };
}

function isoDate(d) {
  // Local calendar date (NOT toISOString, which is UTC) — otherwise 00:00–05:30
  // IST resolves to the previous day and the screen loads yesterday's schedule.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseIsoLocal(str) {
  // `new Date("YYYY-MM-DD")` parses as UTC midnight — build a LOCAL date instead.
  const [y, m, d] = String(str).split('-').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

function addDays(iso, n) {
  const d = parseIsoLocal(iso);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

function toDate(v) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Assignment time: prefer explicit assignment fields if the API sends them,
// otherwise the booking's creation time.
function ticketStart(t) {
  return t?.assignedAt || t?.technicianAssignedAt || t?.createdAt || null;
}

// Tickets relevant to a day: assigned / created / accepted / updated on it, or —
// for today — any still-open ticket (that's today's live workload).
function ticketsForDay(list, dayIso, isToday) {
  const onDay = (v) => {
    const d = toDate(v);
    return !!d && isoDate(d) === dayIso;
  };
  const out = list.filter((t) => {
    if (onDay(ticketStart(t)) || onDay(t.technicianAcceptedAt) || onDay(t.updatedAt)) return true;
    return isToday && !FINAL_TICKET_STATUSES.has(String(t.status || '').toUpperCase());
  });
  return out.sort((a, b) => (toDate(ticketStart(a))?.getTime() || 0) - (toDate(ticketStart(b))?.getTime() || 0));
}

// brandId → Promise<models[]>, shared by all rows so each brand is fetched once
// (same pattern as JobReportScreen's DeviceBadge).
const modelsByBrand = new Map();

const STATUS_META = {
  scheduled: { label: 'Scheduled', Icon: CalendarDays },
  working: { label: 'Working', Icon: CirclePlay },
  completed: { label: 'Completed', Icon: CircleCheck },
  off: { label: 'Off', Icon: Coffee },
};

export default function DailyShiftScheduleScreen({ navigation }) {
  const { width: winW } = useWindowDimensions();
  const sidebarW = useSidebarWidth();
  const { id: technicianId, failed: techIdFailed, retry: retryTechId } = useTechnicianIdState();
  const session = useSelector(selectSession);
  const dutyCheckIn = session?.defaultCheckIn || DEFAULT_DUTY_CHECK_IN;
  const dutyCheckOut = session?.defaultCheckOut || DEFAULT_DUTY_CHECK_OUT;
  const todayIso = isoDate(new Date());
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [dayData, setDayData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dayError, setDayError] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketsError, setTicketsError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const reqSeq = useRef(0);

  const loadDay = useCallback(async (dateStr) => {
    if (!technicianId) return;
    const seq = ++reqSeq.current;
    setLoading(true);
    try {
      const res = await ticketApi.get(`/technicians/${technicianId}/attendance/day`, {
        query: { date: dateStr },
      });
      if (seq !== reqSeq.current) return;
      setDayData(res);
      setDayError(false);
    } catch {
      if (seq !== reqSeq.current) return;
      setDayData(null);
      setDayError(true);
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, [technicianId]);

  const loadTickets = useCallback(async () => {
    try {
      const page = await listMyTickets({ page: 0, size: 100 });
      const items = Array.isArray(page?.content) ? page.content : (Array.isArray(page) ? page : []);
      setTickets(items);
      setTicketsError(false);
    } catch {
      setTicketsError(true);
    } finally {
      setTicketsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDay(selectedDate);
  }, [selectedDate, loadDay]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadDay(selectedDate), loadTickets()]);
    setRefreshing(false);
  }, [loadDay, loadTickets, selectedDate]);

  // Week paging (swipe the strip or tap the small arrows).
  const shiftWeek = useCallback((dir) => setSelectedDate((d) => addDays(d, dir * 7)), []);
  const swipe = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderRelease: (_, g) => {
      if (g.dx < -40) shiftWeek(1);
      else if (g.dx > 40) shiftWeek(-1);
    },
  }), [shiftWeek]);

  const selected = parseIsoLocal(selectedDate);
  const dayLong = DAYS_LONG[selected.getDay()];
  const monthYear = selected.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const mondayStart = new Date(selected);
  const dow = selected.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  mondayStart.setDate(selected.getDate() + mondayOffset);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const x = new Date(mondayStart);
    x.setDate(mondayStart.getDate() + i);
    return x;
  });

  const checkIn = parseTime(dayData?.checkInTime);
  const checkOut = parseTime(dayData?.checkOutTime);
  const shiftStart = parseTime(dutyCheckIn);
  const shiftEnd = parseTime(dutyCheckOut);
  let durationMin = shiftStart && shiftEnd ? shiftEnd.mins - shiftStart.mins : 0;
  if (durationMin < 0) durationMin += 24 * 60; // overnight shift
  // Shared helper so "Late" here matches the Daily Attendance screen.
  const lateMinutes = effectiveLateMinutes(dayData, dutyCheckIn);
  const isLate = lateMinutes > 0;
  const earlyOut = !!(checkOut && shiftEnd && checkOut.mins < shiftEnd.mins);

  const isTodaySelected = selectedDate === todayIso;
  const brk = useBreak(session?.userId || session?.technicianId || session?.email || null, selected);
  const isPast = selectedDate < todayIso;
  const isFuture = selectedDate > todayIso;
  const recStatus = String(dayData?.status || '').toUpperCase();
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  const shiftOver = isPast || (isTodaySelected && shiftEnd && nowMins >= shiftEnd.mins);

  // Real shift status, derived from the attendance record.
  let status;
  if (checkIn && checkOut) status = 'completed';
  else if (checkIn) status = 'working';
  else if (OFF_STATUSES.has(recStatus) || selected.getDay() === 0) status = 'off';
  else if (!shiftOver || isFuture) status = 'scheduled';
  else status = 'absent';
  const pill = status === 'absent'
    ? { label: 'Absent', fg: C.red, bg: C.softRed }
    : status === 'working'
      ? { label: 'Working', fg: C.yellow, bg: C.softYellow }
      : status === 'off'
        ? { label: recStatus === 'HOLIDAY' ? 'Holiday' : recStatus === 'LEAVE' ? 'Leave' : 'Off', fg: C.red, bg: C.softRed }
        : { label: STATUS_META[status].label, fg: C.green, bg: C.mint };

  const shiftTitle = isTodaySelected
    ? "Today's Shift"
    : `Shift · ${DAYS_SHORT[selected.getDay()]} ${selected.getDate()}`;

  const dayTickets = useMemo(
    () => ticketsForDay(tickets, selectedDate, isTodaySelected),
    [tickets, selectedDate, isTodaySelected],
  );

  // The shift sidebar takes the left edge; the page uses the rest.
  const contentW = Math.min(winW - sidebarW, MAX_CONTENT_WIDTH) - rs(20);

  const header = <MintScreenHeader title="Daily Shift Schedule" navigation={navigation} />;

  if (!technicianId) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        {header}
        <TechIdPending failed={techIdFailed} onRetry={retryTechId} />
      </SafeAreaView>
    );
  }

  const breakMins = brk.breakMinutes();
  const sidebarItems = [
    { key: 'today', label: 'Today', icon: CalendarDays, color: '#1C3053', onPress: () => setSelectedDate(todayIso) },
    { key: 'start', label: 'Duty Start', icon: LogIn, color: C.green, sub: shiftStart?.label || '—', static: true },
    { key: 'break', label: 'Break', icon: Coffee, color: C.yellow, sub: brk.onBreak ? 'On break' : breakMins ? formatMinutes(breakMins) : '—', static: true },
    { key: 'end', label: 'Duty End', icon: LogOut, color: C.red, sub: shiftEnd?.label || '—', static: true },
    { key: 'change', label: 'Change', icon: ArrowLeftRight, color: C.blue, sub: 'Shift', onPress: () => setRequestOpen(true) },
  ];

  // Timeline pills: Scheduled, or the real punch with Done / Late / Early.
  const startPill = checkIn
    ? { text: `${isLate ? 'Late' : 'Done'} · ${checkIn.label}`, fg: isLate ? C.red : C.green, bg: isLate ? C.softRed : C.mint }
    : status === 'off'
      ? { text: 'Off', fg: C.muted, bg: C.grey }
      : status === 'absent'
        ? { text: 'Missed', fg: C.red, bg: C.softRed }
        : { text: 'Scheduled', fg: C.green, bg: C.mint };
  const endPill = checkOut
    ? { text: `${earlyOut ? 'Early' : 'Done'} · ${checkOut.label}`, fg: earlyOut ? C.yellow : C.green, bg: earlyOut ? C.softYellow : C.mint }
    : status === 'off'
      ? { text: 'Off', fg: C.muted, bg: C.grey }
      : status === 'working'
        ? { text: 'Pending', fg: C.yellow, bg: C.softYellow }
        : { text: 'Scheduled', fg: C.red, bg: C.softRed };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {header}
      <SidebarLayout sidebar={<LeftVerticalSidebar items={sidebarItems} active={isTodaySelected ? 'today' : null} />}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.green]} tintColor={C.green} />}
      >
        <View style={{ width: contentW }}>
          {/* 1. Selected date + week strip */}
          <View style={styles.card}>
            <View style={styles.dateRow}>
              <Text style={styles.bigDate}>{selected.getDate()}</Text>
              <View style={styles.dateTextCol}>
                <Text style={styles.dayLong} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{dayLong}</Text>
                <Text style={styles.monthYear} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{monthYear}</Text>
              </View>
              <TouchableOpacity style={styles.weekArrow} onPress={() => shiftWeek(-1)} activeOpacity={0.8} hitSlop={6}>
                <ChevronLeft size={rs(14)} color={C.white} strokeWidth={2.6} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.weekArrow} onPress={() => shiftWeek(1)} activeOpacity={0.8} hitSlop={6}>
                <ChevronRight size={rs(14)} color={C.white} strokeWidth={2.6} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.todayBtn, isTodaySelected && styles.todayBtnActive]}
                onPress={() => setSelectedDate(todayIso)}
                activeOpacity={0.85}
              >
                <Text style={styles.todayBtnText}>Today</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.weekStrip} {...swipe.panHandlers}>
              {weekDays.map((dt) => {
                const dateStr = isoDate(dt);
                const isSelected = dateStr === selectedDate;
                const isSunday = dt.getDay() === 0;
                const isToday = dateStr === todayIso;
                return (
                  <TouchableOpacity
                    key={dateStr}
                    style={[
                      styles.weekDay,
                      isSunday && styles.weekDaySunday,
                      isToday && !isSelected && styles.weekDayToday,
                      isSelected && styles.weekDaySelected,
                    ]}
                    onPress={() => setSelectedDate(dateStr)}
                    activeOpacity={0.85}
                  >
                    <Text
                      style={[styles.weekDayName, isSunday && styles.textRed, isSelected && styles.textWhite]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      {DAYS_SHORT[dt.getDay()]}
                    </Text>
                    <Text
                      style={[styles.weekDayNum, isSunday && styles.textRed, isSelected && styles.textWhite]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      {pad2(dt.getDate())}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* 4. Timeline */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Daily Shift Timeline</Text>
            <View style={{ marginTop: rs(8) }}>
              <TimelineRow
                time={shiftStart?.label || '—'}
                dot={C.green}
                connector="down"
                Icon={LogIn}
                iconFg={C.green}
                iconBg={C.mint}
                title="Duty Start"
                sub="Scheduled shift start time"
                value={shiftStart?.label || '—'}
                pill={startPill}
              />
              <TimelineRow
                time={fmtClock(brk.lastStart)} dot="#FAA700" connector="both"
                Icon={Coffee} iconFg="#FAA700" iconBg="#FFE8CC"
                title="Break Start" sub="Break started (logged on this phone)"
                value={fmtClock(brk.lastStart)}
                pill={brk.lastStart ? { text: 'Done', fg: '#609138', bg: '#E4EFDA' } : { text: 'No break', fg: C.muted, bg: '#F3F4F6' }}
              />
              <TimelineRow
                time={fmtClock(brk.lastEnd)} dot="#FAA700" connector="both"
                Icon={Coffee} iconFg="#FAA700" iconBg="#FFE8CC"
                title="Break End" sub={brk.breakMinutes() ? `Total break ${formatMinutes(brk.breakMinutes())}` : 'Break finished'}
                value={fmtClock(brk.lastEnd)}
                pill={brk.onBreak ? { text: 'On break', fg: '#FAA700', bg: '#FFE8CC' } : brk.lastEnd ? { text: 'Done', fg: '#609138', bg: '#E4EFDA' } : { text: '—', fg: C.muted, bg: '#F3F4F6' }}
              />
              <TimelineRow
                time={shiftEnd?.label || '—'}
                dot={C.red}
                connector="up"
                Icon={LogOut}
                iconFg={C.red}
                iconBg={C.softRed}
                title="Duty End"
                sub="Scheduled shift end time"
                value={shiftEnd?.label || '—'}
                pill={endPill}
              />
            </View>
          </View>

          {/* 6. Shift change request */}
          <View style={[styles.card, styles.changeCard]}>
            <View style={{ flex: 1, marginRight: rs(8) }}>
              <Text style={styles.cardTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Shift Change Request</Text>
              <Text style={styles.changeSub}>Request to change your shift timing or date.</Text>
            </View>
            <TouchableOpacity style={styles.changeBtn} onPress={() => setRequestOpen(true)} activeOpacity={0.85}>
              <ArrowLeftRight size={rs(14)} color={C.green} strokeWidth={2.4} />
              <Text style={styles.changeBtnText} numberOfLines={2}>Request Shift Change</Text>
              <ChevronRight size={rs(14)} color={C.green} strokeWidth={2.4} />
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
      </SidebarLayout>

      <ShiftChangeModal
        visible={requestOpen}
        onClose={() => setRequestOpen(false)}
        initialDate={selectedDate < todayIso ? todayIso : selectedDate}
        minDate={todayIso}
        currentStart={shiftStart}
        currentEnd={shiftEnd}
      />
    </SafeAreaView>
  );
}

function DashedLine({ style }) {
  return (
    <View style={[styles.dashWrap, style]} pointerEvents="none">
      {Array.from({ length: 14 }, (_, i) => <View key={i} style={styles.dash} />)}
    </View>
  );
}

function TimelineRow({ time, dot, connector, Icon, iconFg, iconBg, title, sub, value, pill }) {
  return (
    <View style={[styles.tlRow, connector !== 'up' && { marginBottom: rs(8) }]}>
      <Text style={styles.tlTime} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{time}</Text>
      <View style={styles.tlDotCol}>
        {connector === 'down'
          ? <DashedLine style={{ top: '50%', bottom: -rs(8) }} />
          : connector === 'both'
            ? <DashedLine style={{ top: 0, bottom: -rs(8) }} />
            : <DashedLine style={{ top: 0, bottom: '50%' }} />}
        <View style={[styles.tlDot, { backgroundColor: dot }]} />
      </View>
      {/* My Jobs tile look: soft gradient in the row colour, thin border, solid icon circle. */}
      <View style={[styles.tlCard, { borderColor: iconFg }]}>
        <GradientFill tone={toneOf(iconFg)} radius={rs(11)} />
        <View style={[styles.tlIcon, { backgroundColor: iconFg }]}>
          <Icon size={rs(13)} color="#FFFFFF" strokeWidth={2.4} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.tlTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.tlSub} numberOfLines={2}>{sub}</Text>
        </View>
        <View style={styles.tlRight}>
          <Text style={styles.tlValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
          <View style={[styles.tlPill, { backgroundColor: pill.bg }]}>
            <Text style={[styles.tlPillText, { color: pill.fg }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {pill.text}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// Shift change request. There is no shift-change endpoint in src/api, so this
// is filed through the existing employee-leave channel as a same-day
// PERMISSION request (totalDays 0) — it lands in the owner's pending-leaves
// approval list, who also owns the shift timings. The requested window and
// reason are carried in the reason text, as PermissionApplyScreen does.
function ShiftChangeModal({ visible, onClose, initialDate, minDate, currentStart, currentEnd }) {
  const [date, setDate] = useState(initialDate);
  const [from, setFrom] = useState(currentStart?.hhmm || '');
  const [to, setTo] = useState(currentEnd?.hhmm || '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setDate(initialDate);
    setFrom(currentStart?.hhmm || '');
    setTo(currentEnd?.hhmm || '');
    setReason('');
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!date) { notify('Check the form', 'Please pick a date.'); return; }
    if (!from || !to) { notify('Check the form', 'Pick your preferred start and end time.'); return; }
    if (to <= from) { notify('Check the form', 'End time must be after start time.'); return; }
    if (currentStart && currentEnd && from === currentStart.hhmm && to === currentEnd.hhmm) {
      notify('No change', 'The requested timing is the same as your current shift.');
      return;
    }
    if (!reason.trim()) { notify('Check the form', 'Please enter a reason.'); return; }
    setSaving(true);
    try {
      const current = currentStart && currentEnd ? ` (current ${currentStart.label} – ${currentEnd.label})` : '';
      await applyEmployeeLeave({
        leaveType: 'PERMISSION',
        startDate: date,
        endDate: date,
        totalDays: 0,
        reason: `Shift change request: ${to12h(from)} – ${to12h(to)}${current}: ${reason.trim()}`,
        attachmentUrl: null,
      });
      notify('Request sent', 'Your shift change request was sent to the owner for approval.', { preset: 'done' });
      onClose();
    } catch (e) {
      notify('Could not submit', e?.message ?? 'Failed to send shift change request', { preset: 'error', haptic: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHead}>
            <Text style={styles.cardTitle}>Request Shift Change</Text>
            <TouchableOpacity style={styles.sheetClose} onPress={onClose} activeOpacity={0.8} hitSlop={8}>
              <X size={rs(16)} color={C.ink} strokeWidth={2.4} />
            </TouchableOpacity>
          </View>
          <Text style={styles.sheetHint}>Sent to the shop owner for approval.</Text>

          <Text style={styles.fieldLabel}>Date</Text>
          <DatePickerField value={date} onChange={setDate} minimumDate={minDate} fieldStyle={styles.field} accent={C.green} accentSoft={C.mint} />

          <View style={styles.timeRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Preferred start</Text>
              <TimePickerField value={from} placeholder="Start" onChange={setFrom} fieldStyle={styles.field} accent={C.green} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.fieldLabel}>Preferred end</Text>
              <TimePickerField value={to} placeholder="End" onChange={setTo} fieldStyle={styles.field} accent={C.green} />
            </View>
          </View>

          <Text style={styles.fieldLabel}>Reason</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Why do you need this change?"
            placeholderTextColor={C.faint}
            multiline
            style={styles.reasonInput}
            maxLength={300}
          />

          <TouchableOpacity style={[styles.submitBtn, saving && { opacity: 0.7 }]} onPress={submit} disabled={saving} activeOpacity={0.85}>
            {saving
              ? <ActivityIndicator size="small" color={C.white} />
              : <Text style={styles.submitText}>Send Request</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const cardShadow = {
  shadowColor: '#111111', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  scroll: { alignItems: 'center', paddingTop: rs(2), paddingBottom: rs(20) },

  card: {
    backgroundColor: C.card, borderRadius: rs(16), borderWidth: 1, borderColor: C.border,
    padding: rs(10), marginBottom: rs(10), ...cardShadow,
  },
  cardHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: rs(8) },
  cardTitle: { fontSize: rf(16), fontWeight: '800', color: C.ink, flexShrink: 1 },

  dateRow: { flexDirection: 'row', alignItems: 'center' },
  bigDate: { fontSize: rf(32), fontWeight: '800', color: C.ink, marginRight: rs(8), letterSpacing: -1 },
  dateTextCol: { flex: 1, minWidth: 0 },
  dayLong: { fontSize: rf(16), fontWeight: '800', color: C.ink },
  monthYear: { fontSize: rf(12.5), color: C.muted, marginTop: 1 },
  weekArrow: {
    width: rs(24), height: rs(24), borderRadius: rs(12), backgroundColor: C.green,
    alignItems: 'center', justifyContent: 'center', marginRight: rs(5),
  },
  todayBtn: {
    borderWidth: 1.5, borderColor: C.green, backgroundColor: C.white,
    paddingHorizontal: rs(12), paddingVertical: rs(4), borderRadius: 999, marginLeft: rs(1),
  },
  todayBtnActive: { backgroundColor: C.mint },
  todayBtnText: { color: C.ink, fontSize: rf(13), fontWeight: '700' },

  weekStrip: { flexDirection: 'row', gap: rs(4), marginTop: rs(10) },
  weekDay: {
    flex: 1, paddingVertical: rs(6), alignItems: 'center', borderRadius: rs(10),
    backgroundColor: C.grey, borderWidth: 1, borderColor: '#E5E7EB',
  },
  weekDayToday: { borderColor: C.green },
  weekDaySelected: { backgroundColor: C.green, borderColor: C.green },
  weekDaySunday: { backgroundColor: C.softRed, borderColor: C.redBorder },
  weekDayName: { fontSize: rf(11), color: C.muted, fontWeight: '600' },
  weekDayNum: { fontSize: rf(15), fontWeight: '800', color: C.ink, marginTop: 1 },
  textWhite: { color: C.white },
  textRed: { color: C.red },

  statusPill: { paddingHorizontal: rs(10), paddingVertical: rs(4), borderRadius: rs(8) },
  statusPillText: { fontSize: rf(11.5), fontWeight: '700' },

  tileRow: { flexDirection: 'row', gap: rs(6), marginTop: rs(8) },
  tile: {
    flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: rs(11),
    paddingHorizontal: rs(6), paddingVertical: rs(8), gap: rs(5),
  },
  tileIcon: {
    width: rs(26), height: rs(26), borderRadius: rs(13), backgroundColor: C.white, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  tileLabel: { fontSize: rf(10), color: C.muted },
  tileValue: { fontSize: rf(13), fontWeight: '800', color: C.ink, marginTop: 1 },

  errorRow: { flexDirection: 'row', alignItems: 'center', gap: rs(6), marginTop: rs(8) },
  errorText: { flex: 1, fontSize: rf(11.5), color: C.red, fontWeight: '600' },
  noteText: { fontSize: rf(11.5), color: C.muted, marginTop: rs(8) },

  segRow: { flexDirection: 'row', gap: rs(5), marginTop: rs(8) },
  seg: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(4),
    paddingVertical: rs(8), paddingHorizontal: rs(4), borderRadius: rs(10),
    backgroundColor: C.grey, borderWidth: 1, borderColor: C.grey,
  },
  segText: { fontSize: rf(11.5), fontWeight: '600', flexShrink: 1 },

  tlRow: { flexDirection: 'row', alignItems: 'center' },
  tlTime: { width: rs(58), fontSize: rf(11.5), fontWeight: '600', color: C.ink },
  tlDotCol: { width: rs(16), alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  tlDot: { width: rs(10), height: rs(10), borderRadius: rs(5) },
  dashWrap: {
    position: 'absolute', width: 1.5, alignItems: 'center', justifyContent: 'space-between', overflow: 'hidden',
  },
  dash: { width: 1.5, height: rs(3), backgroundColor: '#C9C9C9' },
  tlCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: rs(7), marginLeft: rs(4),
    borderWidth: 1, borderColor: C.border, borderRadius: rs(12), paddingHorizontal: rs(8), paddingVertical: rs(6),
    backgroundColor: C.white,
  },
  tlIcon: { width: rs(26), height: rs(26), borderRadius: rs(13), alignItems: 'center', justifyContent: 'center' },
  tlTitle: { fontSize: rf(13), fontWeight: '800', color: C.ink },
  tlSub: { fontSize: rf(10.5), color: C.muted, marginTop: 1 },
  tlRight: { alignItems: 'flex-end', maxWidth: rs(96), gap: rs(3) },
  tlValue: { fontSize: rf(11.5), fontWeight: '600', color: C.ink },
  tlPill: { paddingHorizontal: rs(7), paddingVertical: rs(2), borderRadius: rs(7) },
  tlPillText: { fontSize: rf(10), fontWeight: '700' },

  accentTitle: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 },
  accentBar: { width: rs(4), height: rs(18), borderRadius: 2, backgroundColor: C.green, marginRight: rs(7) },
  viewAll: {
    flexDirection: 'row', alignItems: 'center', gap: rs(3), borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: rs(9), paddingHorizontal: rs(9), paddingVertical: rs(4),
  },
  viewAllText: { fontSize: rf(11.5), fontWeight: '600', color: C.ink },

  workRow: {
    flexDirection: 'row', alignItems: 'center', gap: rs(7), backgroundColor: '#F7F9F8',
    borderRadius: rs(12), paddingHorizontal: rs(8), paddingVertical: rs(8),
  },
  workTimeCol: { width: rs(52) },
  workTimeTop: { fontSize: rf(11.5), fontWeight: '600', color: C.ink },
  workTimeBot: { fontSize: rf(11), color: C.muted, marginTop: 1 },
  workDivider: { width: 1, alignSelf: 'stretch', backgroundColor: '#DCDCDC' },
  devTile: {
    width: rs(32), height: rs(32), borderRadius: rs(9), backgroundColor: C.mint,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  devTileImg: { backgroundColor: C.white, borderWidth: 1, borderColor: C.border },
  workRef: { fontSize: rf(12.5), fontWeight: '800', color: C.ink },
  workSub: { fontSize: rf(10.5), color: C.muted, marginTop: 1 },
  workPill: { paddingHorizontal: rs(8), paddingVertical: rs(3), borderRadius: rs(8) },
  workPillText: { fontSize: rf(10.5), fontWeight: '700' },

  emptyBox: { alignItems: 'center', gap: rs(5), paddingVertical: rs(14) },
  emptyText: { fontSize: rf(12), color: C.muted, textAlign: 'center' },

  changeCard: { flexDirection: 'row', alignItems: 'center' },
  changeSub: { fontSize: rf(12), color: C.muted, marginTop: 2 },
  changeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: rs(5), backgroundColor: C.mint,
    borderWidth: 1, borderColor: C.mintBorder, borderRadius: rs(11),
    paddingHorizontal: rs(9), paddingVertical: rs(8), maxWidth: '55%',
  },
  changeBtnText: { fontSize: rf(12), fontWeight: '700', color: C.green, flexShrink: 1 },

  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: rs(16) },
  sheet: { backgroundColor: C.white, borderRadius: rs(16), padding: rs(14), width: '100%', maxWidth: 480, alignSelf: 'center' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetClose: {
    width: rs(28), height: rs(28), borderRadius: rs(14), backgroundColor: C.grey,
    alignItems: 'center', justifyContent: 'center',
  },
  sheetHint: { fontSize: rf(12), color: C.muted, marginTop: 2, marginBottom: rs(6) },
  fieldLabel: { fontSize: rf(11.5), fontWeight: '700', color: C.ink, marginTop: rs(8), marginBottom: rs(4) },
  field: { borderRadius: rs(10), minHeight: rs(40) },
  timeRow: { flexDirection: 'row', gap: rs(8) },
  reasonInput: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: rs(10), minHeight: rs(64),
    paddingHorizontal: rs(10), paddingVertical: rs(8), fontSize: rf(12.5), color: C.ink, textAlignVertical: 'top',
  },
  submitBtn: {
    marginTop: rs(12), backgroundColor: C.green, borderRadius: rs(11), paddingVertical: rs(11), alignItems: 'center',
  },
  submitText: { color: C.white, fontSize: rf(13.5), fontWeight: '800' },
});
