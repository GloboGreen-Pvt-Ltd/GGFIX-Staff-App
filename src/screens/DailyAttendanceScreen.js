import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';
import { ticketApi } from '../api/client';
import { useTechnicianId } from '../auth/useTechnicianId';
import { selectSession } from '../store/authSlice';
import { rf } from '../utils/responsive';

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

export default function DailyAttendanceScreen() {
  const technicianId = useTechnicianId();
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

  if (!technicianId) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}><ActivityIndicator color="#00008B" /></View>
      </SafeAreaView>
    );
  }

  const present = data?.presentDays ?? 0;
  const late = data?.lateHours ?? '0';
  const permission = data?.permissionCount ?? 0;
  const leaves = data?.leaveDays ?? 0;
  const holidays = data?.holidayCount ?? 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        <View style={styles.dailySection}>
          <View style={styles.dailyHeader}>
            <Text style={styles.dailyTitle}>This Month</Text>
            <View style={styles.dailyMonthPill}>
              <TouchableOpacity onPress={() => stepMonth(-1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                <Ionicons name="chevron-back" size={12} color="#111827" />
              </TouchableOpacity>
              <Text style={styles.dailyMonthText}>{MONTHS[month - 1]} {year}</Text>
              <TouchableOpacity onPress={() => stepMonth(1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                <Ionicons name="chevron-forward" size={12} color="#111827" />
              </TouchableOpacity>
              <View style={styles.dailyMonthBtn}>
                <Ionicons name="calendar" size={12} color="#FFFFFF" />
              </View>
            </View>
          </View>

          {loading && !data ? (
            <ActivityIndicator size="large" color="#00008B" style={{ marginVertical: 24 }} />
          ) : (data?.dailyRecords && data.dailyRecords.length > 0) ? (
            data.dailyRecords.map((day) => <DayCard key={day.date} day={day} dutyCheckIn={dutyCheckIn} />)
          ) : (
            <Text style={styles.empty}>No attendance records for this month.</Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatRing({ value, label, color }) {
  return (
    <View style={styles.statRingWrap}>
      <View style={[styles.statRing, { borderColor: color }]}>
        <Text style={styles.statRingValue}>{value}</Text>
      </View>
      <Text style={[styles.statRingLabel, { color }]}>{label}</Text>
    </View>
  );
}

function DayCard({ day, dutyCheckIn }) {
  const status = (day.status || 'GENERAL').toUpperCase();
  const dateLabel = formatDateLabel(day);
  if (status === 'LEAVE') {
    return (
      <View style={[styles.dayCard, styles.dayCardLeave]}>
        <View style={styles.dayLeftAccent} />
        <View style={styles.dayInner}>
          <View style={styles.dayTopRow}>
            <Text style={styles.dayDate}>{dateLabel}</Text>
            <View style={[styles.dayPill, styles.dayPillLeave]}>
              <Text style={styles.dayPillTextOn}>Leave</Text>
            </View>
          </View>
        </View>
      </View>
    );
  }
  if (status === 'WEEK_OFF') {
    return (
      <View style={[styles.dayCard, styles.dayCardWeekOff]}>
        <View style={styles.dayLeftAccent} />
        <View style={styles.dayInner}>
          <View style={styles.dayTopRow}>
            <Text style={styles.dayDate}>{dateLabel}</Text>
            <View style={[styles.dayPill, styles.dayPillWeekOff]}>
              <Text style={styles.dayPillTextOn}>Week Off</Text>
            </View>
          </View>
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
  return (
    <View style={styles.dayCard}>
      <View style={[styles.dayLeftAccent, isLate && { backgroundColor: '#DC2626' }]} />
      <View style={styles.dayInner}>
        <View style={styles.dayTopRow}>
          <Text style={styles.dayDate}>{dateLabel}</Text>
          <View style={styles.dayTopRight}>
            {isLate ? (
              <View style={[styles.dayPill, styles.dayPillLate]}>
                <Text style={styles.dayPillTextOn}>Late{lateLabel ? ` • ${lateLabel}` : ''}</Text>
              </View>
            ) : (
              <View style={[styles.dayPill, styles.dayPillGeneral]}>
                <Text style={styles.dayPillText}>General</Text>
              </View>
            )}
            {isPermission ? (
              <View style={[styles.dayPill, styles.dayPillPermission]}>
                <Text style={styles.dayPillText}>{day.notes || 'Permission'}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={styles.dayCols}>
          <View style={styles.dayCol}>
            <Text style={[styles.dayColValue, isLate && styles.dayColValueLate]}>
              {formatTime12(day.checkInTime)}
            </Text>
            <Text style={styles.dayColLabel}>Check In</Text>
          </View>
          <View style={styles.dayCol}>
            <Text style={styles.dayColValue}>{formatTime12(day.checkOutTime)}</Text>
            <Text style={styles.dayColLabel}>Check Out</Text>
          </View>
          <View style={styles.dayCol}>
            <Text style={[styles.dayColValue, isLate && styles.dayColValueLate]}>
              {formatWorkingHours(day.workingHours)}
            </Text>
            <Text style={styles.dayColLabel}>Working HR's</Text>
          </View>
          <View style={styles.dayCol}>
            <Text style={[styles.dayColValue, lateMinutes > 0 && styles.dayColValueLate]}>
              {lateMinutes > 0 ? formatDuration(lateMinutes) : '—'}
            </Text>
            <Text style={styles.dayColLabel}>Late HR's</Text>
          </View>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: 12, paddingBottom: 24 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  error: { fontSize: rf(14), color: '#DC2626' },

  card: { backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  cardTitle: { fontSize: rf(14), fontWeight: '700', color: '#111827' },

  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E3A8A',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    gap: 6,
  },
  monthPillText: { color: '#FFFFFF', fontSize: rf(11), fontWeight: '700' },
  monthPillSep: { width: 1, height: 12, backgroundColor: 'rgba(255,255,255,0.3)' },

  statRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  statRingWrap: { alignItems: 'center', flex: 1 },
  statRing: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  statRingValue: { fontSize: rf(12), fontWeight: '800', color: '#111827' },
  statRingLabel: { fontSize: rf(10), fontWeight: '700', marginTop: 4 },

  calendar: { marginTop: 4, marginBottom: 8 },
  calRowHeader: { flexDirection: 'row', marginBottom: 6 },
  calRow: { flexDirection: 'row' },
  calCell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  calHeaderCell: { flex: 1, textAlign: 'center', fontSize: rf(10), fontWeight: '800', color: '#374151' },
  calHeaderSunday: { color: '#DC2626' },
  calCellNum: { fontSize: rf(13), fontWeight: '600', color: '#111827' },
  calCellSunday: { color: '#DC2626' },
  calDot: { width: 6, height: 6, borderRadius: 3, marginTop: 2 },

  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: rf(11), color: '#374151', fontWeight: '500' },

  dailySection: { marginTop: 14 },
  dailyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  dailyTitle: { fontSize: rf(14), fontWeight: '700', color: '#111827' },
  dailyMonthPill: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dailyMonthText: { fontSize: rf(12), fontWeight: '700', color: '#111827' },
  dailyMonthBtn: { backgroundColor: '#1E1EAC', width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  dayCard: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 10, marginBottom: 8, overflow: 'hidden' },
  dayCardLeave: { backgroundColor: '#FCA5A5' },
  dayCardWeekOff: { backgroundColor: '#F9A8D4' },
  dayLeftAccent: { width: 3, backgroundColor: '#1E1EAC' },
  dayInner: { flex: 1, padding: 10 },
  dayTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dayTopRight: { flexDirection: 'row', gap: 6 },
  dayDate: { fontSize: rf(12), fontWeight: '700', color: '#111827' },
  dayPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  dayPillGeneral: { backgroundColor: '#DCFCE7' },
  dayPillPermission: { backgroundColor: '#FEE2E2' },
  dayPillLeave: { backgroundColor: '#EF4444' },
  dayPillLate: { backgroundColor: '#DC2626' },
  dayPillWeekOff: { backgroundColor: '#DB2777' },
  dayPillText: { fontSize: rf(10), fontWeight: '700', color: '#111827' },
  dayPillTextOn: { fontSize: rf(10), fontWeight: '700', color: '#FFFFFF' },

  dayCols: { flexDirection: 'row', marginTop: 8 },
  dayCol: { flex: 1 },
  dayColValue: { fontSize: rf(12), fontWeight: '700', color: '#004C40' },
  dayColValueLate: { color: '#DC2626' },
  dayColLabel: { fontSize: rf(10), color: '#6B7280', marginTop: 2 },

  empty: { fontSize: rf(13), color: '#6B7280', textAlign: 'center', paddingVertical: 20 },
});
