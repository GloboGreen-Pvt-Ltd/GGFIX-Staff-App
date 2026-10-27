import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl,
  useWindowDimensions, Modal, Pressable,
} from 'react-native';
import { Text } from '../components/Typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Calendar,
  ChevronRight,
  Clock,
  ClockAlert,
  LogIn,
  LogOut,
  Timer,
  User,
  AlarmClock,
  CircleX,
  FileText,
  Zap,
  X,
  StickyNote,
  RefreshCw,
  Briefcase,
} from 'lucide-react-native';
import { useSelector } from 'react-redux';
import { ticketApi } from '../api/client';
import { useTechnicianIdState } from '../auth/useTechnicianId';
import TechIdPending from '../components/TechIdPending';
import { selectSession } from '../store/authSlice';
import { rf, rs, sheetWidth } from '../utils/responsive';
import MintScreenHeader, { MintBackdrop, useHideNativeHeader } from '../components/MintScreenHeader';
import { MonthPill, TILE_TONES, solidGlyph } from '../components/MintKit';
import { LeftVerticalSidebar, SidebarLayout, useSidebarWidth } from '../components/JobCardKit';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// Screen palette.
const C = {
  green: '#035C6C',
  mint: '#E5F3F5',
  softMint: '#E5F3F5',
  mintBorder: '#E5F3F5',
  bg: '#F3F4F6',
  card: '#FFFFFF',
  border: '#E5E7EB',
  text: '#111111',
  muted: '#6B7280',
  faint: '#B8B8B8',
  red: '#F32C26',
  softRed: '#FBCFCF',
  redBorder: '#F2A3A3',
  lateText: '#FAA700',
  lateBg: '#FFF3E0',
  absentBg: '#FDDCDC',
  // Distinct colour per status: leave = blue, late = orange, overtime/permission = purple, hours = teal.
  blue: '#0788C9',
  softBlue: '#D8ECF8',
  blueBorder: '#9CCFEA',
  purple: '#1C3053',
  softPurple: '#E6F3FA',
  yellow: '#FAA700',
  softYellow: '#FFDCAE',
  yellowBorder: '#FBBE6E',
  teal: '#035C6C',
  softTeal: '#C3E2E7',
  tealBorder: '#98CBD3',
  grey: '#4B4B4B',
  softGrey: '#F1F1F1',
};
const MAX_CONTENT_WIDTH = 720;
const DEFAULT_VISIBLE_ROWS = 4;

// Fallback duty start when the technician hasn't configured one yet. Matches
// the placeholder in TechnicianProfileScreen so the per-day "Late HR's"
// column lines up with what's visually pre-filled in the profile form.
const DEFAULT_DUTY_CHECK_IN = '09:30:00';
// Same idea for duty end — used only to derive the shift length for overtime.
const DEFAULT_DUTY_CHECK_OUT = '18:30:00';

// "HH:mm[:ss]" → minutes since midnight. Used to compute late minutes
// client-side when the backend returned 0 (typically because the
// technician's defaultCheckIn column is null in the DB).
function parseTimeToMinutes(s) {
  if (!s || typeof s !== 'string') return null;
  const [h, m] = s.split(':');
  const hh = Number(h);
  const mm = Number(m || 0);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

// A check-in within this many minutes of the duty start is still on-time.
// Must match the backend LATE_GRACE_MINUTES so the client fallback agrees with
// the server's LATE classification.
const LATE_GRACE_MINUTES = 5;

// Late minutes for a single day. Honours backend value when non-zero;
// otherwise derives it from the duty start (session or fallback) and the
// recorded check-in, applying the same 5-minute grace the backend uses.
// Returns 0 for non-present statuses so a LEAVE / HOLIDAY row doesn't
// accidentally accumulate late minutes if the data row happens to carry a
// stale check-in.
export function effectiveLateMinutes(record, dutyCheckIn) {
  if (!record) return 0;
  const status = String(record.status || '').toUpperCase();
  if (status === 'LEAVE' || status === 'HOLIDAY' || status === 'WEEK_OFF') return 0;
  const backend = Number(record.lateMinutes || 0);
  if (backend > 0) return backend;
  const checkInMin = parseTimeToMinutes(record.checkInTime);
  const dutyMin = parseTimeToMinutes(dutyCheckIn || DEFAULT_DUTY_CHECK_IN);
  if (checkInMin == null || dutyMin == null) return 0;
  const diff = checkInMin - dutyMin;
  // Within the grace window → on-time (0); beyond it → true minutes late.
  return diff > LATE_GRACE_MINUTES ? diff : 0;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Visual config per day kind. "off" = week-off / holiday rows. Colours are the
// app-wide TILE_TONES (Partner dashboard set); bg / border are their tints.
// Filled icons for the stat tiles (Partner-app style); chips and day rows keep
// KIND's outline icons.
const STAT_ICONS = {
  present: solidGlyph(MaterialCommunityIcons, 'account-check'),
  late: solidGlyph(MaterialCommunityIcons, 'clock-alert'),
  absent: solidGlyph(MaterialCommunityIcons, 'account-cancel'),
  leave: solidGlyph(MaterialCommunityIcons, 'calendar-remove'),
  work: solidGlyph(MaterialCommunityIcons, 'briefcase-clock'),
  overtime: solidGlyph(MaterialCommunityIcons, 'lightning-bolt'),
};

const KIND = {
  present: { label: 'Present', color: TILE_TONES.green, bg: `${TILE_TONES.green}1F`, border: `${TILE_TONES.green}55`, icon: User, dot: TILE_TONES.green },
  late: { label: 'Late', color: TILE_TONES.orange, bg: `${TILE_TONES.orange}1F`, border: `${TILE_TONES.orange}55`, icon: AlarmClock, dot: TILE_TONES.orange },
  absent: { label: 'Absent', color: TILE_TONES.red, bg: `${TILE_TONES.red}1F`, border: `${TILE_TONES.red}55`, icon: CircleX, dot: TILE_TONES.red },
  leave: { label: 'Leave', color: TILE_TONES.blue, bg: `${TILE_TONES.blue}1F`, border: `${TILE_TONES.blue}55`, icon: FileText, dot: TILE_TONES.blue },
  off: { label: 'Week Off', color: C.muted, bg: C.softGrey, border: C.border, icon: Calendar, dot: C.faint },
};
const FILTERS = ['all', 'present', 'late', 'absent', 'leave'];

function pad2(n) {
  return String(n).padStart(2, '0');
}
function isoOf(y, m, d) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}
function todayIso() {
  const t = new Date();
  return isoOf(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

// Backend "HH:mm[:ss]" working-hours string → minutes (0 when missing).
function workingMinutesOf(record) {
  const v = parseTimeToMinutes(record?.workingHours);
  return v && v > 0 ? v : 0;
}

// Classify an attendance row into one of the KIND buckets.
function classifyRecord(record, dutyCheckIn) {
  const s = String(record?.status || '').toUpperCase();
  if (s === 'LEAVE') return 'leave';
  if (s === 'WEEK_OFF' || s === 'HOLIDAY') return 'off';
  if (s === 'ABSENT') return 'absent';
  if (s === 'LATE' || effectiveLateMinutes(record, dutyCheckIn) > 0) return 'late';
  return 'present';
}

export default function DailyAttendanceScreen({ navigation }) {
  useHideNativeHeader(navigation);
  const { width: winW } = useWindowDimensions();
  const sidebarW = useSidebarWidth();
  const { id: technicianId, failed: techIdFailed, retry: retryTechId } = useTechnicianIdState();
  const session = useSelector(selectSession);
  const dutyCheckIn = session?.defaultCheckIn || DEFAULT_DUTY_CHECK_IN;
  const dutyCheckOut = session?.defaultCheckOut || DEFAULT_DUTY_CHECK_OUT;
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState(null);
  const [leaves, setLeaves] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(false);
  const [selectedIso, setSelectedIso] = useState(null);
  const [detailDay, setDetailDay] = useState(null);
  const reqId = useRef(0);
  const scrollRef = useRef(null);
  const recordsY = useRef(0);

  const load = useCallback(async (isRefresh = false) => {
    if (!technicianId) return;
    const id = ++reqId.current;
    if (isRefresh) setRefreshing(true);
    else { setLoading(true); setData(null); setLeaves([]); }
    setError(null);
    try {
      const [res, lv] = await Promise.all([
        ticketApi.get(`/technicians/${technicianId}/attendance`, { query: { month, year } }),
        // Approved leave requests let us place leave days on the calendar even
        // when no per-day attendance row exists. Best-effort only.
        ticketApi.get(`/technicians/${technicianId}/leaves`, { query: { month, year } }).catch(() => []),
      ]);
      if (id !== reqId.current) return;
      setData(res || { dailyRecords: [] });
      setLeaves(Array.isArray(lv) ? lv : (lv?.content || []));
    } catch (e) {
      if (id !== reqId.current) return;
      if (!isRefresh) setData(null);
      setError(e?.message || 'Could not load attendance.');
    } finally {
      if (id === reqId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [technicianId, month, year]);

  React.useEffect(() => { load(); }, [load]);

  const recordsByDate = useMemo(() => {
    const map = {};
    (data?.dailyRecords || []).forEach((r) => { if (r.date) map[String(r.date)] = r; });
    return map;
  }, [data]);

  // Approved leave requests expanded into a date → leave map for this month.
  const leaveByDate = useMemo(() => {
    const map = {};
    (leaves || []).forEach((l) => {
      if (String(l?.status || '').toUpperCase() !== 'APPROVED' || !l.startDate) return;
      const [sy, sm, sd] = String(l.startDate).split('-').map(Number);
      const endStr = String(l.endDate || l.startDate);
      const [ey, em, ed] = endStr.split('-').map(Number);
      if (!sy || !ey) return;
      const cur = new Date(sy, sm - 1, sd);
      const end = new Date(ey, em - 1, ed);
      let guard = 0;
      while (cur <= end && guard < 400) {
        if (cur.getFullYear() === year && cur.getMonth() + 1 === month) {
          map[isoOf(year, month, cur.getDate())] = l;
        }
        cur.setDate(cur.getDate() + 1);
        guard++;
      }
    });
    return map;
  }, [leaves, month, year]);

  // Every date of the month with its derived kind:
  //  - row present → classified from status / late minutes
  //  - no row + approved leave → leave
  //  - no row + Sunday → week off (not listed)
  //  - no row + past working day → absent
  //  - today without a row / future → no mark yet
  const days = useMemo(() => {
    if (!data) return [];
    const tIso = todayIso();
    const lastDay = new Date(year, month, 0).getDate();
    const out = [];
    for (let d = 1; d <= lastDay; d++) {
      const iso = isoOf(year, month, d);
      const dow = new Date(year, month - 1, d).getDay();
      const record = recordsByDate[iso] || null;
      const leave = leaveByDate[iso] || null;
      let kind = null;
      if (record) kind = classifyRecord(record, dutyCheckIn);
      else if (leave) kind = 'leave';
      else if (dow === 0) kind = 'off';
      else if (iso < tIso) kind = 'absent';
      out.push({ iso, day: d, dow, month, year, record, leave, kind });
    }
    return out;
  }, [data, recordsByDate, leaveByDate, year, month, dutyCheckIn]);

  const shiftMinutes = useMemo(() => {
    const a = parseTimeToMinutes(dutyCheckIn);
    const b = parseTimeToMinutes(dutyCheckOut);
    return a != null && b != null && b > a ? b - a : null;
  }, [dutyCheckIn, dutyCheckOut]);

  const stats = useMemo(() => {
    const c = { present: 0, late: 0, absent: 0, leave: 0 };
    let workTotal = 0; let workedDays = 0; let otTotal = 0;
    days.forEach((d) => {
      if (c[d.kind] != null) c[d.kind] += 1;
      const wm = workingMinutesOf(d.record);
      if (wm > 0 && (d.kind === 'present' || d.kind === 'late')) {
        workTotal += wm;
        workedDays += 1;
        if (shiftMinutes) otTotal += Math.max(0, wm - shiftMinutes);
      }
    });
    const denom = c.present + c.late + c.absent + c.leave;
    const pct = (n) => (denom ? `${((n / denom) * 100).toFixed(1)}% of days` : '—');
    return {
      ...c,
      denom,
      pct,
      workTotal,
      workAvg: workedDays ? Math.round(workTotal / workedDays) : 0,
      otTotal,
      otAvg: workedDays ? Math.round(otTotal / workedDays) : 0,
      workedDays,
    };
  }, [days, shiftMinutes]);

  // Listable days (most recent first): anything classified except synthetic Sundays.
  const listDays = useMemo(() => days
    .filter((d) => d.kind && (d.kind !== 'off' || d.record))
    .filter((d) => filter === 'all' || d.kind === filter)
    .sort((a, b) => (a.iso < b.iso ? 1 : -1)), [days, filter]);

  const stepMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y--; }
    else if (m > 12) { m = 1; y++; }
    setMonth(m);
    setYear(y);
    setExpanded(false);
    setSelectedIso(null);
  };

  const applyFilter = (f, scroll = false) => {
    setFilter(f);
    setExpanded(false);
    if (scroll && scrollRef.current) {
      scrollRef.current.scrollTo({ y: Math.max(0, recordsY.current - rs(60)), animated: true });
    }
  };

  const openDay = (d) => {
    setSelectedIso(d.iso);
    setDetailDay(d);
  };

  // The status sidebar takes the left edge; the page uses the rest.
  const contentW = Math.min(winW - sidebarW, MAX_CONTENT_WIDTH);
  const innerW = contentW - rs(20);

  const header = <MintScreenHeader title="Daily Attendance" navigation={navigation} />;

  if (!technicianId) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <MintBackdrop />
        {header}
        <TechIdPending failed={techIdFailed} onRetry={retryTechId} />
      </SafeAreaView>
    );
  }

  const monthLabel = `${MONTHS[month - 1]} ${year}`;
  // Left sidebar: the four statuses filter the records (tap again for all);
  // Work Hrs / Overtime only show the month's totals.
  const sidebarItems = [
    { key: 'present', label: 'Present', icon: STAT_ICONS.present, color: KIND.present.color, count: stats.present },
    { key: 'late', label: 'Late', icon: STAT_ICONS.late, color: KIND.late.color, count: stats.late },
    { key: 'absent', label: 'Absent', icon: STAT_ICONS.absent, color: KIND.absent.color, count: stats.absent },
    { key: 'leave', label: 'Leave', icon: STAT_ICONS.leave, color: KIND.leave.color, count: stats.leave },
    { key: 'work', label: 'Work Hrs', icon: STAT_ICONS.work, color: TILE_TONES.teal, sub: fmtShortHM(stats.workTotal), static: true },
    { key: 'overtime', label: 'Overtime', icon: STAT_ICONS.overtime, color: TILE_TONES.navy, sub: shiftMinutes ? fmtShortHM(stats.otTotal) : '—', static: true },
  ];
  const visibleRows = expanded ? listDays : listDays.slice(0, DEFAULT_VISIBLE_ROWS);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MintBackdrop />
      {header}
      <SidebarLayout
        sidebar={<LeftVerticalSidebar items={sidebarItems} active={filter} onPick={(k) => applyFilter(filter === k ? 'all' : k, true)} />}
      >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[C.green]} tintColor={C.green} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: innerW }}>
          {/* This Month */}
          <View style={styles.card}>
            <View style={styles.rowCenter}>
              <View style={styles.monthIconTile}>
                <Calendar size={rs(14)} color="#FFFFFF" strokeWidth={2.2} />
              </View>
              <Text style={[styles.monthTitle, { flex: 1, marginHorizontal: rs(6) }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>This Month</Text>
              <MonthPill compact month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
            </View>
          </View>

          {loading && !data ? (
            <View style={[styles.card, styles.stateCard]}>
              <ActivityIndicator size="large" color={C.green} />
              <Text style={styles.stateText}>Loading attendance…</Text>
            </View>
          ) : error && !data ? (
            <View style={[styles.card, styles.stateCard]}>
              <CircleX size={rs(28)} color={C.red} />
              <Text style={styles.stateText}>{error}</Text>
              <TouchableOpacity onPress={() => load()} style={styles.retryBtn} accessibilityRole="button">
                <RefreshCw size={rs(14)} color="#FFFFFF" />
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {filter !== 'all' ? (
                <TouchableOpacity onPress={() => applyFilter('all')} style={styles.clearChip} accessibilityRole="button" accessibilityLabel="Show all days">
                  <Text style={styles.clearChipText}>Showing {KIND[filter].label.toLowerCase()} days</Text>
                  <CircleX size={rs(13)} color={C.green} strokeWidth={2.2} />
                </TouchableOpacity>
              ) : null}

              {/* Records */}
              <View onLayout={(e) => { recordsY.current = e.nativeEvent.layout.y; }}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>Daily Attendance Records</Text>
                  {listDays.length > DEFAULT_VISIBLE_ROWS ? (
                    <TouchableOpacity onPress={() => setExpanded((v) => !v)} style={styles.rowCenter} hitSlop={8} accessibilityRole="button">
                      <Text style={styles.seeAll}>{expanded ? 'Show Less' : 'See All'}</Text>
                      <ChevronRight size={rs(15)} color={C.green} strokeWidth={2.4} style={expanded ? { transform: [{ rotate: '-90deg' }] } : null} />
                    </TouchableOpacity>
                  ) : null}
                </View>
                {visibleRows.length === 0 ? (
                  <View style={[styles.card, styles.stateCard]}>
                    <Text style={styles.stateText}>
                      {filter === 'all' ? 'No attendance records for this month.' : `No ${KIND[filter].label.toLowerCase()} days this month.`}
                    </Text>
                  </View>
                ) : visibleRows.map((d) => (
                  <RecordRow key={d.iso} d={d} dutyCheckIn={dutyCheckIn} onPress={() => openDay(d)} />
                ))}
              </View>

            </>
          )}
        </View>
      </ScrollView>
      </SidebarLayout>

      <DayDetailsModal
        d={detailDay}
        dutyCheckIn={dutyCheckIn}
        dutyCheckOut={dutyCheckOut}
        shiftMinutes={shiftMinutes}
        onClose={() => setDetailDay(null)}
      />
    </SafeAreaView>
  );
}

function RoundBtn({ onPress, label, children, size = rs(34) }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.roundBtn, { width: size, height: size, borderRadius: size / 2 }]}
    >
      {children}
    </TouchableOpacity>
  );
}

function MiniTile({ icon: Icon, value, label, color, bg, valueColor }) {
  return (
    <View style={[styles.mini, { backgroundColor: bg }]}>
      <Icon size={rs(11)} color={color} strokeWidth={2.3} />
      <Text style={[styles.miniValue, { color: valueColor || C.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{value}</Text>
      <Text style={styles.miniLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{label}</Text>
    </View>
  );
}

function RecordRow({ d, dutyCheckIn, onPress }) {
  const k = KIND[d.kind] || KIND.present;
  const r = d.record;
  const lateMin = r ? effectiveLateMinutes(r, dutyCheckIn) : 0;
  const isPermission = String(r?.status || '').toUpperCase() === 'PERMISSION';
  const offLabel = String(r?.status || '').toUpperCase() === 'HOLIDAY' ? 'Holiday' : k.label;
  const PillIcon = k.icon;
  const late = lateMin > 0;
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={[styles.recordCard, { borderLeftColor: k.color }]} accessibilityRole="button" accessibilityLabel={`${formatDateLabel(d)} ${k.label}`}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={[styles.rowCenter, { flexWrap: 'wrap', gap: rs(5), marginBottom: rs(5) }]}>
          <Text style={{ flex: 1, fontSize: rf(13), fontWeight: '800', color: C.text }} numberOfLines={1}>
            {DOW[d.dow]}, {pad2(d.day)} {MONTHS_SHORT[d.month - 1]}
          </Text>
          <View style={[styles.statusPill, { backgroundColor: k.bg }]}>
            <View style={[styles.pillDot, { backgroundColor: k.color }]}>
              <PillIcon size={rs(9)} color="#FFFFFF" strokeWidth={2.8} />
            </View>
            <Text style={[styles.statusPillText, { color: C.text }]}>{d.kind === 'off' ? offLabel : k.label}</Text>
          </View>
          {isPermission ? (
            <View style={[styles.statusPill, { backgroundColor: C.softPurple }]}>
              <View style={[styles.pillDot, { backgroundColor: C.purple }]}>
                <Timer size={rs(9)} color="#FFFFFF" strokeWidth={2.8} />
              </View>
              <Text style={[styles.statusPillText, { color: C.text }]}>Permission</Text>
            </View>
          ) : null}
        </View>
        {d.kind === 'leave' || d.kind === 'off' || (d.kind === 'absent' && !r) ? (
          <Text style={styles.rowNote} numberOfLines={2}>
            {d.kind === 'leave'
              ? (d.leave?.leaveType ? `${prettyLeaveType(d.leave.leaveType)}${d.leave.reason ? ` • ${d.leave.reason}` : ''}` : (r?.notes || 'On leave'))
              : d.kind === 'off' ? (r?.notes || 'No duty scheduled') : 'No check-in recorded'}
          </Text>
        ) : (
          <View style={styles.miniRow}>
            <MiniTile icon={LogIn} color="#609138" bg="#E8F5E9" value={formatTime12(r?.checkInTime)} label="Check In" valueColor={C.text} />
            <MiniTile icon={LogOut} color="#F32C26" bg="#FDEBEC" value={formatTime12(r?.checkOutTime)} label="Check Out" />
            <MiniTile icon={Clock} color="#035C6C" bg="#DDF2F4" value={formatWorkingHours(r?.workingHours)} label="Working Hrs" />
            <MiniTile icon={ClockAlert} color="#FAA700" bg="#FFF0D5"
                      value={late ? fmtHM(lateMin) : '—'} label="Late Hrs" valueColor={C.text} />
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

function DetailRow({ icon: Icon, color, label, value, valueColor }) {
  return (
    <View style={styles.detailRow}>
      <View style={[styles.detailIcon, { backgroundColor: `${color}1A` }]}>
        <Icon size={rs(15)} color={color} strokeWidth={2.3} />
      </View>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, valueColor && { color: valueColor }]}>{value}</Text>
    </View>
  );
}

function DayDetailsModal({ d, dutyCheckIn, dutyCheckOut, shiftMinutes, onClose }) {
  const visible = !!d;
  const r = d?.record;
  const k = d?.kind ? KIND[d.kind] : null;
  const lateMin = r ? effectiveLateMinutes(r, dutyCheckIn) : 0;
  const wm = workingMinutesOf(r);
  const ot = shiftMinutes && wm > 0 && (d?.kind === 'present' || d?.kind === 'late') ? Math.max(0, wm - shiftMinutes) : 0;
  const isPermission = String(r?.status || '').toUpperCase() === 'PERMISSION';
  const statusLabel = !k ? (d && d.iso > todayIso() ? 'Upcoming' : 'No record yet')
    : d.kind === 'off' && String(r?.status || '').toUpperCase() === 'HOLIDAY' ? 'Holiday' : k.label;
  const PillIcon = k?.icon || Calendar;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, sheetWidth]} onPress={() => {}}>
          {d ? (
            <>
              <View style={styles.sheetHandle} />
              <View style={[styles.rowCenter, { marginBottom: rs(12) }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetTitle}>{formatDateLabel(d)}</Text>
                  <View style={[styles.rowCenter, { gap: rs(6), marginTop: rs(6), flexWrap: 'wrap' }]}>
                    <View style={[styles.statusPill, { backgroundColor: k ? k.bg : C.softGrey }]}>
                      <PillIcon size={rs(12)} color={k ? k.color : C.muted} strokeWidth={2.4} />
                      <Text style={[styles.statusPillText, { color: C.text }]}>{statusLabel}</Text>
                    </View>
                    {isPermission ? (
                      <View style={[styles.statusPill, { backgroundColor: C.softPurple }]}>
                        <Timer size={rs(12)} color={C.purple} strokeWidth={2.4} />
                        <Text style={[styles.statusPillText, { color: C.text }]}>Permission</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <RoundBtn onPress={onClose} label="Close"><X size={rs(18)} color={C.text} strokeWidth={2.4} /></RoundBtn>
              </View>

              <DetailRow icon={LogIn} color={C.green} label="Check In" value={formatTime12(r?.checkInTime)} valueColor={null} />
              <DetailRow icon={LogOut} color={C.green} label="Check Out" value={formatTime12(r?.checkOutTime)} />
              <DetailRow icon={Clock} color={C.teal} label="Working Hours" value={formatWorkingHours(r?.workingHours)} />
              <DetailRow icon={ClockAlert} color={C.yellow} label="Late By" value={lateMin > 0 ? fmtHM(lateMin) : '—'} valueColor={null} />
              <DetailRow icon={Zap} color={C.purple} label="Overtime" value={ot > 0 ? fmtHM(ot) : '—'} valueColor={ot > 0 ? C.purple : null} />
              <DetailRow icon={Briefcase} color={C.green} label="Duty Shift" value={`${formatTime12(dutyCheckIn)} – ${formatTime12(dutyCheckOut)}`} />
              {d.leave ? (
                <DetailRow icon={FileText} color={C.blue} label="Leave"
                           value={`${prettyLeaveType(d.leave.leaveType) || 'Approved'}${d.leave.appliedDaysLabel ? ` (${d.leave.appliedDaysLabel})` : ''}`} />
              ) : null}
              {d.leave?.reason ? <DetailRow icon={StickyNote} color={C.blue} label="Leave Reason" value={d.leave.reason} /> : null}
              {r?.notes ? <DetailRow icon={StickyNote} color={C.muted} label="Notes" value={r.notes} /> : null}
              {d.kind === 'absent' && !r ? (
                <Text style={styles.sheetHint}>No check-in was recorded on this working day.</Text>
              ) : null}
            </>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function prettyLeaveType(t) {
  if (!t) return '';
  return String(t).toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Minutes → "162h 30m" / "9h 02m" (padMin) / "45m".
// Short hours for a stat button's count badge: "12h", "45m", "0m".
function fmtShortHM(minutes) {
  if (!minutes || minutes <= 0) return '0m';
  const h = Math.floor(minutes / 60);
  return h ? `${h}h` : `${Math.round(minutes)}m`;
}

function fmtHM(minutes, padMin = false) {
  if (!minutes || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h && m) return `${h}h ${padMin ? pad2(m) : m}m`;
  if (h) return padMin ? `${h}h 00m` : `${h}h`;
  return `${m}m`;
}

// Backend sends workingHours as "HH:mm[:ss]"; render it as "8h 30m".
function formatWorkingHours(s) {
  if (!s || typeof s !== 'string') return '—';
  const [h, m] = s.split(':');
  const hh = Number(h) || 0;
  const mm = Number(m) || 0;
  if (hh === 0 && mm === 0) return '—';
  if (hh && mm) return `${hh}h ${pad2(mm)}m`;
  return hh ? `${hh}h` : `${mm}m`;
}

function formatTime12(t) {
  if (!t || typeof t !== 'string') return '—';
  const [hhRaw, mm] = t.split(':');
  const hh = Number(hhRaw);
  if (Number.isNaN(hh)) return '—';
  const period = hh >= 12 ? 'PM' : 'AM';
  const h12 = ((hh - 1 + 12) % 12) + 1;
  return `${pad2(h12)}:${pad2(Number(mm || 0))} ${period}`;
}

function formatDateLabel(d) {
  if (!d?.iso) return '—';
  // Parse ISO YYYY-MM-DD locally so the day-of-week doesn't drift by a day under
  // negative-offset timezones (new Date('2026-06-06') is UTC midnight).
  const [y, m, dd] = d.iso.split('-').map(Number);
  const dt = new Date(y, m - 1, dd);
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getDay()];
  return `${dow}, ${pad2(dd)} ${MONTHS_SHORT[m - 1]} ${y}`;
}

const cardShadow = {
  shadowColor: '#111111', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1,
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  content: { alignItems: 'center', paddingTop: rs(2), paddingBottom: rs(24) },
  rowCenter: { flexDirection: 'row', alignItems: 'center' },

  card: {
    backgroundColor: C.card, borderRadius: rs(16), borderWidth: 1, borderColor: C.border,
    padding: rs(8), marginBottom: rs(8), ...cardShadow,
  },
  stateCard: { alignItems: 'center', paddingVertical: rs(24), gap: rs(8) },
  stateText: { fontSize: rf(13), color: C.muted, textAlign: 'center' },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: rs(6), backgroundColor: C.green,
    paddingHorizontal: rs(16), paddingVertical: rs(8), borderRadius: 999, marginTop: rs(4),
  },
  retryText: { color: '#FFFFFF', fontWeight: '700', fontSize: rf(13) },

  // This Month
  monthIconTile: {
    width: rs(28), height: rs(28), borderRadius: rs(14), backgroundColor: C.green,
    alignItems: 'center', justifyContent: 'center',
  },
  monthTitle: { fontSize: rf(14.5), fontWeight: '800', color: C.text },
  monthSubtitle: { fontSize: rf(12), color: C.muted, marginTop: 1 },
  roundBtn: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', ...cardShadow,
  },
  monthPill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(6),
    backgroundColor: C.green, borderWidth: 1, borderColor: C.green, borderRadius: 999,
    paddingHorizontal: rs(12), paddingVertical: rs(7),
  },
  monthPillText: { fontSize: rf(13.5), fontWeight: '700', color: '#FFFFFF', flexShrink: 1 },

  // Stats
  // Three equal columns via percentages — never wraps to two per row.
  clearChip: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: rs(6), marginBottom: rs(8),
    backgroundColor: C.mint, borderRadius: 999, paddingHorizontal: rs(10), paddingVertical: rs(4),
  },
  clearChipText: { fontSize: rf(11.5), fontWeight: '700', color: C.green },
  statTile: { borderRadius: rs(14), borderWidth: 1, paddingVertical: rs(10), paddingHorizontal: rs(8), alignItems: 'center', minHeight: rs(70), justifyContent: 'center' },
  statTop: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center' },
  statIcon: {
    width: rs(28), height: rs(28), borderRadius: rs(14), borderWidth: 1.5, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  statValue: { fontSize: rf(18), fontWeight: '800', color: C.text },
  statLabel: { fontSize: rf(12), fontWeight: '600', color: C.muted, marginTop: rs(4), textAlign: 'center' },
  statCaption: { fontSize: rf(11), fontWeight: '600', marginTop: 1 },

  // Chips
  chipsRow: { gap: rs(8), paddingVertical: rs(2), paddingRight: rs(4) },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: rs(5), borderRadius: 999, borderWidth: 1,
    paddingHorizontal: rs(12), paddingVertical: rs(5),
  },
  chipAll: { backgroundColor: C.mint, borderColor: C.mintBorder },
  chipAllActive: { backgroundColor: C.green, borderColor: C.green, paddingHorizontal: rs(16) },
  chipText: { fontSize: rf(12), fontWeight: '700' },

  // Records
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: rs(6), marginTop: rs(2), gap: rs(8) },
  sectionTitle: { fontSize: rf(14.5), fontWeight: '800', color: C.text, flexShrink: 1 },
  seeAll: { fontSize: rf(12), fontWeight: '700', color: C.green },
  recordCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: rs(14),
    borderWidth: 1, borderColor: C.border, borderLeftWidth: rs(3), paddingVertical: rs(5), paddingHorizontal: rs(7), marginBottom: rs(5), ...cardShadow,
  },
  dateBlock: {
    width: rs(36), alignItems: 'center', justifyContent: 'center', borderRadius: rs(9),
    backgroundColor: C.softMint, paddingVertical: rs(3), marginRight: rs(6), alignSelf: 'stretch',
  },
  dateDow: { fontSize: rf(10), fontWeight: '700', color: C.muted, letterSpacing: 0.5 },
  dateNum: { fontSize: rf(16), fontWeight: '800', color: C.text },
  dateMon: { fontSize: rf(10), color: C.muted },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: rs(4), alignSelf: 'flex-start',
    paddingLeft: rs(2), paddingRight: rs(8), paddingVertical: rs(2), borderRadius: 999,
  },
  pillDot: { width: rs(16), height: rs(16), borderRadius: rs(8), alignItems: 'center', justifyContent: 'center' },
  statusPillText: { fontSize: rf(10.5), fontWeight: '700' },
  rowNote: { fontSize: rf(11.5), color: C.muted },
  miniRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: rs(4) },
  mini: { width: '49%', minWidth: 0, borderRadius: rs(8), paddingHorizontal: rs(6), paddingVertical: rs(4) },
  miniValue: { fontSize: rf(11.5), fontWeight: '800', marginTop: 0 },
  miniLabel: { fontSize: rf(9), color: C.muted, marginTop: 0 },

  // Calendar
  calNav: { width: rs(26), height: rs(26), alignItems: 'center', justifyContent: 'center' },
  calMonth: { fontSize: rf(13), fontWeight: '700', color: C.text },
  calGrid: { borderWidth: 1, borderColor: C.border, borderRadius: rs(12), overflow: 'hidden', paddingBottom: rs(4) },
  calWeek: { flexDirection: 'row' },
  calCell: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: rs(3) },
  calDow: { fontSize: rf(11), fontWeight: '700', color: C.muted, paddingVertical: rs(5) },
  calCircle: { width: rs(30), height: rs(30), borderRadius: rs(15), alignItems: 'center', justifyContent: 'center' },
  calDay: { fontSize: rf(12) },
  legend: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: rs(16), marginTop: rs(10) },
  legendDot: { width: rs(9), height: rs(9), borderRadius: rs(5), marginRight: rs(5) },
  legendText: { fontSize: rf(11.5), color: C.text },

  // Details sheet
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.card, borderTopLeftRadius: rs(20), borderTopRightRadius: rs(20),
    paddingHorizontal: rs(16), paddingTop: rs(8), paddingBottom: rs(28),
  },
  sheetHandle: { alignSelf: 'center', width: rs(40), height: rs(4), borderRadius: 2, backgroundColor: '#DADADA', marginBottom: rs(12) },
  sheetTitle: { fontSize: rf(17), fontWeight: '800', color: C.text },
  sheetHint: { fontSize: rf(12), color: C.muted, marginTop: rs(8) },
  detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: rs(8), borderBottomWidth: 1, borderBottomColor: '#F2F2F2', gap: rs(10) },
  detailIcon: { width: rs(30), height: rs(30), borderRadius: rs(15), alignItems: 'center', justifyContent: 'center' },
  detailLabel: { fontSize: rf(13), color: C.muted, width: rs(100) },
  detailValue: { flex: 1, fontSize: rf(13.5), fontWeight: '700', color: C.text, textAlign: 'right' },
});
