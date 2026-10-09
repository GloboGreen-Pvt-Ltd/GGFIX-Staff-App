import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Calendar, ChevronLeft, ChevronRight, Clock, ClockAlert, CircleCheck, LogIn, LogOut, Timer,
} from 'lucide-react-native';
import { useSelector } from 'react-redux';
import { ticketApi } from '../api/client';
import { useTechnicianIdState } from '../auth/useTechnicianId';
import TechIdPending from '../components/TechIdPending';
import { selectSession } from '../store/authSlice';
import { rf, rlh, rs } from '../utils/responsive';
import MintScreenHeader, { MintBackdrop, useHideNativeHeader } from '../components/MintScreenHeader';

// Screen palette (GGFIX green + mint).
const C = {
  green: '#09AD2A',
  deep: '#09AD2A',
  primary: '#09AD2A',
  mint: '#E6F7EA',
  softMint: '#F3FBF4',
  bg: '#F8F8F8',
  card: '#FFFFFF',
  border: '#E6E6E6',
  text: '#1E1E1E',
  muted: '#6E6E6E',
  red: '#F84141',
  softRed: '#FEECEC',
  // Blue isn't in the palette — neutral grey + ink instead.
  blue: '#1E1E1E',
  softBlue: '#F3F3F3',
};
const MAX_CONTENT_WIDTH = 720;

// Fallback duty start when the technician hasn't configured one yet. Matches
// the placeholder in TechnicianProfileScreen so the per-day "Late HR's"
// column lines up with what's visually pre-filled in the profile form.
const DEFAULT_DUTY_CHECK_IN = '09:30:00';

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

const STATUS_COLORS = {
  LEAVE: '#DB2777',
  LATE: '#EAB308',
  PERMISSION: '#F97316',
  WEEK_OFF: '#F472B6',
  HOLIDAY: '#004C40',
};
const RING_COLORS = {
  present: '#004C40',
  late: '#EAB308',
  permission: '#F97316',
  leaves: '#DB2777',
  holidays: '#1E3A8A',
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

export default function DailyAttendanceScreen({ navigation }) {
  useHideNativeHeader(navigation);
  const { width: winW } = useWindowDimensions();
  const { id: technicianId, failed: techIdFailed, retry: retryTechId } = useTechnicianIdState();
  const session = useSelector(selectSession);
  const dutyCheckIn = session?.defaultCheckIn || DEFAULT_DUTY_CHECK_IN;
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (!technicianId) return;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await ticketApi.get(`/technicians/${technicianId}/attendance`, {
        query: { month, year },
      });
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [technicianId, month, year]);

  React.useEffect(() => { load(); }, [load]);

  const recordsByDate = useMemo(() => {
    const map = {};
    (data?.dailyRecords || []).forEach((r) => { if (r.date) map[r.date] = r; });
    return map;
  }, [data]);

  const grid = useMemo(() => {
    const first = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0).getDate();
    const startOffset = first.getDay();
    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= lastDay; d++) {
      const iso = `${year}-${pad2(month)}-${pad2(d)}`;
      cells.push({ day: d, iso, record: recordsByDate[iso] || null });
    }
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
  }, [year, month, recordsByDate]);

  const stepMonth = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y--; }
    else if (m > 12) { m = 1; y++; }
    setMonth(m);
    setYear(y);
  };

  const contentW = Math.min(winW, MAX_CONTENT_WIDTH);
  // Month controls sit beside the title on wide screens, on their own row on phones.
  const monthInline = contentW >= 600;
  // Status pill sits right of the date on wide cards, under it on narrow ones.
  const pillInline = contentW >= 430;

  if (!technicianId) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <MintBackdrop />
        <MintScreenHeader title="Daily Attendance" navigation={navigation} />
        <TechIdPending failed={techIdFailed} onRetry={retryTechId} />
      </SafeAreaView>
    );
  }

  const present = data?.presentDays ?? 0;
  const late = data?.lateHours ?? '0';
  const permission = data?.permissionCount ?? 0;
  const leaves = data?.leaveDays ?? 0;
  const holidays = data?.holidayCount ?? 0;

  const monthControls = (
    <View style={[styles.monthControls, !monthInline && styles.monthControlsStacked]}>
      <TouchableOpacity onPress={() => stepMonth(-1)} style={styles.monthStepBtn} hitSlop={6} accessibilityLabel="Previous month">
        <ChevronLeft size={rs(18)} color={C.text} strokeWidth={2.4} />
      </TouchableOpacity>
      <View style={[styles.monthPill, !monthInline && { flex: 1 }]}>
        <Calendar size={rs(15)} color={C.green} />
        <Text style={styles.monthPillText} numberOfLines={1}>{MONTHS[month - 1]} {year}</Text>
      </View>
      <TouchableOpacity onPress={() => stepMonth(1)} style={styles.monthStepBtn} hitSlop={6} accessibilityLabel="Next month">
        <ChevronRight size={rs(18)} color={C.text} strokeWidth={2.4} />
      </TouchableOpacity>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MintBackdrop />
      <MintScreenHeader title="Daily Attendance" navigation={navigation} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[C.deep]} tintColor={C.deep} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: contentW - rs(32) }}>
          {/* This Month selector */}
          <View style={styles.monthCard}>
            <View style={styles.monthCardTop}>
              <View style={styles.monthIconTile}>
                <Calendar size={rs(20)} color={C.green} strokeWidth={2.2} />
              </View>
              <View style={styles.monthTitleWrap}>
                <Text style={styles.monthTitle} numberOfLines={1}>This Month</Text>
                <Text style={styles.monthSubtitle} numberOfLines={2}>View your daily attendance records</Text>
              </View>
              {monthInline ? monthControls : null}
            </View>
            {monthInline ? null : monthControls}
          </View>

          {loading && !data ? (
            <ActivityIndicator size="large" color={C.deep} style={{ marginVertical: rs(24) }} />
          ) : (data?.dailyRecords && data.dailyRecords.length > 0) ? (
            data.dailyRecords.map((day) => <DayCard key={day.date} day={day} dutyCheckIn={dutyCheckIn} pillInline={pillInline} />)
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.empty}>No attendance records for this month.</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// Day-of-week + day-of-month for the date tile, parsed locally like formatDateLabel.
function dateTileParts(day) {
  const parts = String(day?.date || '').split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const dd = Number(parts[2]);
  if (!y || !m || !dd) return null;
  return { dow: DOW[new Date(y, m - 1, dd).getDay()], dd: pad2(dd) };
}

function StatusPill({ icon: Icon, bg, color, iconColor, text }) {
  return (
    <View style={[styles.statusPill, { backgroundColor: bg }]}>
      {Icon ? <Icon size={rs(13)} color={iconColor || color} strokeWidth={2.4} /> : null}
      <Text style={[styles.statusPillText, { color }]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

function DayTop({ day, pillInline, children }) {
  const tile = dateTileParts(day);
  return (
    <View style={styles.dayTopRow}>
      {tile ? (
        <View style={styles.dateTile}>
          <Text style={styles.dateTileDow}>{tile.dow}</Text>
          <Text style={styles.dateTileNum}>{tile.dd}</Text>
        </View>
      ) : null}
      <View style={[styles.dayTopMain, pillInline && styles.dayTopMainInline]}>
        <Text style={[styles.dayDate, pillInline && { flexShrink: 1, marginRight: rs(8) }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
          {formatDateLabel(day)}
        </Text>
        <View style={[styles.dayPills, !pillInline && { marginTop: rs(6) }]}>{children}</View>
      </View>
    </View>
  );
}

function Metric({ icon: Icon, bg, iconBg, iconColor, value, valueColor, label }) {
  return (
    <View style={[styles.metric, { backgroundColor: bg }]}>
      <View style={[styles.metricIcon, { backgroundColor: iconBg }]}>
        <Icon size={rs(14)} color={iconColor} strokeWidth={2.2} />
      </View>
      <Text style={[styles.metricValue, { color: valueColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
      <Text style={styles.metricLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{label}</Text>
    </View>
  );
}

function DayCard({ day, dutyCheckIn, pillInline }) {
  const status = (day.status || 'GENERAL').toUpperCase();
  if (status === 'LEAVE') {
    return (
      <View style={styles.dayCard}>
        <View style={styles.dayInner}>
          <DayTop day={day} pillInline={pillInline}>
            <StatusPill icon={Calendar} bg="#FEF6E4" color="#B45309" text="Leave" />
          </DayTop>
        </View>
      </View>
    );
  }
  if (status === 'WEEK_OFF') {
    return (
      <View style={styles.dayCard}>
        <View style={styles.dayInner}>
          <DayTop day={day} pillInline={pillInline}>
            <StatusPill icon={Calendar} bg="#FDEBF4" color="#BE185D" text="Week Off" />
          </DayTop>
        </View>
      </View>
    );
  }
  const lateMinutes = effectiveLateMinutes(day, dutyCheckIn);
  // Promote the visual status to LATE when the client-side computation says
  // so, even if the backend stored "GENERAL" because defaultCheckIn was null
  // at check-in time. Otherwise the status pill and the Late HR's column
  // disagree and the user can't tell which to trust.
  const isLate = status === 'LATE' || lateMinutes > 0;
  const isPermission = status === 'PERMISSION';
  const lateLabel = lateMinutes > 0 ? formatDuration(lateMinutes) : null;
  const onTimeColor = C.text;
  return (
    <View style={styles.dayCard}>
      {isLate ? <View style={styles.dayLeftAccent} /> : null}
      <View style={styles.dayInner}>
        <DayTop day={day} pillInline={pillInline}>
          {isLate ? (
            <StatusPill icon={Clock} bg={C.softRed} color={C.red} text={`Late${lateLabel ? ` • ${lateLabel}` : ''}`} />
          ) : (
            <StatusPill icon={CircleCheck} bg={C.mint} iconColor={C.green} color={C.text} text="General" />
          )}
          {isPermission ? (
            <StatusPill icon={Timer} bg={C.softBlue} color={C.blue} text={day.notes || 'Permission'} />
          ) : null}
        </DayTop>
        <View style={styles.metricsRow}>
          <Metric icon={LogIn} bg={C.softRed} iconBg="#FDDCDC" iconColor={C.red}
                  value={formatTime12(day.checkInTime)} valueColor={isLate ? C.red : onTimeColor} label="Check In" />
          <Metric icon={LogOut} bg={C.softMint} iconBg={C.mint} iconColor={C.deep}
                  value={formatTime12(day.checkOutTime)} valueColor={onTimeColor} label="Check Out" />
          <Metric icon={Clock} bg={C.softBlue} iconBg="#E6E6E6" iconColor={C.blue}
                  value={formatWorkingHours(day.workingHours)} valueColor={isLate ? C.red : onTimeColor} label="Working HR's" />
          <Metric icon={ClockAlert} bg={C.softRed} iconBg="#FDDCDC" iconColor={C.red}
                  value={lateMinutes > 0 ? formatDuration(lateMinutes) : '—'} valueColor={lateMinutes > 0 ? C.red : onTimeColor} label="Late HR's" />
        </View>
      </View>
    </View>
  );
}

function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

// Backend sends workingHours as "HH:mm[:ss]"; render it like the Late column
// ("8h 30m") instead of the raw "08:30:00".
function formatWorkingHours(s) {
  if (!s || typeof s !== 'string') return '—';
  const [h, m] = s.split(':');
  const hh = Number(h) || 0;
  const mm = Number(m) || 0;
  if (hh === 0 && mm === 0) return '—';
  if (hh && mm) return `${hh}h ${mm}m`;
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

function formatDateLabel(day) {
  if (!day?.date) return day?.dayLabel || '—';
  // Parse ISO YYYY-MM-DD locally so the day-of-week doesn't drift by a day under
  // negative-offset timezones (new Date('2026-06-06') is UTC midnight).
  const parts = String(day.date).split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const dd = Number(parts[2]);
  if (!y || !m || !dd) return day?.dayLabel || '—';
  const d = new Date(y, m - 1, dd);
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  return `${dow}, ${pad2(dd)} ${MONTHS_SHORT[m - 1]} ${y}`;
}

const cardShadow = {
  shadowColor: '#1E1E1E', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  content: { alignItems: 'center', paddingTop: rs(2), paddingBottom: rs(16) },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // This Month card
  monthCard: {
    backgroundColor: C.card, borderRadius: rs(16), borderWidth: 1, borderColor: C.border,
    paddingVertical: rs(9), paddingHorizontal: rs(12), marginBottom: rs(8), ...cardShadow,
  },
  monthCardTop: { flexDirection: 'row', alignItems: 'center' },
  monthIconTile: {
    width: rs(38), height: rs(38), borderRadius: rs(11), backgroundColor: C.mint,
    alignItems: 'center', justifyContent: 'center',
  },
  monthTitleWrap: { flex: 1, flexShrink: 1, marginLeft: rs(10), marginRight: rs(8) },
  monthTitle: { fontSize: rf(16), fontWeight: '800', color: C.text },
  monthSubtitle: { fontSize: rf(11.5), color: C.muted, marginTop: 1 },
  monthControls: { flexDirection: 'row', alignItems: 'center', gap: rs(6) },
  monthControlsStacked: { marginTop: rs(8) },
  monthStepBtn: {
    width: rs(32), height: rs(32), borderRadius: rs(16), backgroundColor: C.card,
    borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center',
  },
  monthPill: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: rs(6),
    backgroundColor: C.mint, borderWidth: 1, borderColor: '#CDEFD5', borderRadius: 999,
    paddingHorizontal: rs(14), paddingVertical: rs(6),
  },
  monthPillText: { fontSize: rf(13), fontWeight: '700', color: C.text, flexShrink: 1 },

  // Day card
  dayCard: {
    flexDirection: 'row', backgroundColor: C.card, borderRadius: rs(16), borderWidth: 1, borderColor: C.border,
    marginBottom: rs(7), overflow: 'hidden', ...cardShadow,
  },
  dayLeftAccent: { width: rs(4), backgroundColor: C.red },
  dayInner: { flex: 1, padding: rs(9) },
  dayTopRow: { flexDirection: 'row', alignItems: 'center' },
  dateTile: {
    minWidth: rs(44), paddingHorizontal: rs(6), paddingVertical: rs(4), borderRadius: rs(11),
    backgroundColor: C.softMint, borderWidth: 1, borderColor: '#E1F3E5', alignItems: 'center', marginRight: rs(9),
  },
  dateTileDow: { fontSize: rf(10), fontWeight: '700', color: C.muted, letterSpacing: 0.5 },
  dateTileNum: { fontSize: rf(18), fontWeight: '800', color: C.text, marginTop: -2 },
  dayTopMain: { flex: 1 },
  dayTopMainInline: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayDate: { fontSize: rf(14.5), fontWeight: '800', color: C.text },
  dayPills: { flexDirection: 'row', flexWrap: 'wrap', gap: rs(5) },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: rs(5), alignSelf: 'flex-start',
    paddingHorizontal: rs(9), paddingVertical: rs(3), borderRadius: 999, maxWidth: '100%',
  },
  statusPillText: { fontSize: rf(11.5), fontWeight: '700', flexShrink: 1 },

  metricsRow: { flexDirection: 'row', gap: rs(5), marginTop: rs(7) },
  metric: { flex: 1, borderRadius: rs(11), paddingHorizontal: rs(6), paddingVertical: rs(6) },
  metricIcon: { width: rs(24), height: rs(24), borderRadius: rs(12), alignItems: 'center', justifyContent: 'center' },
  metricValue: { fontSize: rf(13.5), fontWeight: '800', marginTop: rs(4) },
  metricLabel: { fontSize: rf(10), lineHeight: rlh(13), color: C.muted, marginTop: 1 },

  emptyCard: {
    backgroundColor: C.card, borderRadius: rs(16), borderWidth: 1, borderColor: C.border, ...cardShadow,
  },
  empty: { fontSize: rf(13), color: C.muted, textAlign: 'center', paddingVertical: rs(20) },
});
