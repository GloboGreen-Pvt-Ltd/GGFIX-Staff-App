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
import { effectiveLateMinutes } from './DailyAttendanceScreen';
import { rf } from '../utils/responsive';

// Monthly Summary = the Attendance Overview card (stat rings + calendar +
// legend). The day-by-day "Attendance Monthly" list lives on the separate
// Daily Attendance screen.

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

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

export default function MonthlySummaryScreen() {
  const technicianId = useTechnicianId();
  const session = useSelector(selectSession);
  const dutyCheckIn = session?.defaultCheckIn || '09:30:00';
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

  // Aggregate the overview rings from the day-by-day records rather than
  // trusting backend-supplied totals. Going row-by-row keeps the rings in
  // lockstep with what the Daily Attendance screen shows for each date —
  // if the user opens Daily Attendance and counts the LEAVE pills, that
  // count must match the "Leaves" ring here. Falls back to the backend
  // summary only when dailyRecords is empty (e.g. months with no data yet).
  const aggregates = useMemo(() => {
    const rows = data?.dailyRecords || [];
    if (rows.length === 0) {
      return {
        present: data?.presentDays ?? 0,
        lateMinutes: null,
        lateHoursLabel: String(data?.lateHours ?? '0'),
        permission: data?.permissionCount ?? 0,
        leaves: data?.leaveDays ?? 0,
        holidays: data?.holidayCount ?? 0,
      };
    }
    let presentCount = 0;
    let permissionCount = 0;
    let leaveCount = 0;
    let holidayCount = 0;
    let lateMinutesTotal = 0;
    rows.forEach((r) => {
      const status = String(r.status || '').toUpperCase();
      const hasCheckIn = !!r.checkInTime;
      if (status === 'LEAVE') leaveCount += 1;
      else if (status === 'HOLIDAY') holidayCount += 1;
      else if (status === 'PERMISSION') {
        permissionCount += 1;
        if (hasCheckIn) presentCount += 1;
      } else if (hasCheckIn) {
        // GENERAL, LATE, or any other "the technician showed up" status
        // counts as a present day.
        presentCount += 1;
      }
      // Use the same fallback the Daily Attendance card uses so the rings
       // stay in lockstep with what each day reads — when the backend value
      // is 0, derive late minutes from the duty start and the check-in time.
      lateMinutesTotal += effectiveLateMinutes(r, dutyCheckIn);
    });
    // Render late as a one-decimal hours value so 30 minutes shows "0.5"
    // instead of getting truncated to "0".
    const lateHours = lateMinutesTotal / 60;
    const lateHoursLabel = lateHours === 0
      ? '0'
      : (Math.round(lateHours * 10) / 10).toString();
    return {
      present: presentCount,
      lateMinutes: lateMinutesTotal,
      lateHoursLabel,
      permission: permissionCount,
      leaves: leaveCount,
      holidays: holidayCount,
    };
  }, [data, dutyCheckIn]);

  const present = aggregates.present;
  const late = aggregates.lateHoursLabel;
  const permission = aggregates.permission;
  const leaves = aggregates.leaves;
  const holidays = aggregates.holidays;

  const lateDays = useMemo(() => {
    return (data?.dailyRecords || [])
      .map((r) => ({ ...r, _effectiveLateMinutes: effectiveLateMinutes(r, dutyCheckIn) }))
      .filter((r) => r._effectiveLateMinutes > 0)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [data, dutyCheckIn]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
      >
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.cardTitle}>Attendance{'\n'}Overview</Text>
            <View style={styles.monthPill}>
              <Text style={styles.monthPillText}>{MONTHS[month - 1]} {year}</Text>
              <TouchableOpacity onPress={() => stepMonth(-1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                <Ionicons name="chevron-back" size={14} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={styles.monthPillSep} />
              <TouchableOpacity onPress={() => stepMonth(1)} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}>
                <Ionicons name="chevron-forward" size={14} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>

          {loading && !data ? (
            <ActivityIndicator size="large" color="#00008B" style={{ marginVertical: 24 }} />
          ) : (
            <>
              <View style={styles.statRow}>
                <StatRing value={present} label="Present" color={RING_COLORS.present} />
                <StatRing value={`${late} Hrs`} label="Late" color={RING_COLORS.late} />
                <StatRing value={pad2(permission)} label="Permission" color={RING_COLORS.permission} />
                <StatRing value={pad2(leaves)} label="Leaves" color={RING_COLORS.leaves} />
                <StatRing value={pad2(holidays)} label="Holidays" color={RING_COLORS.holidays} />
              </View>

              <View style={styles.calendar}>
                <View style={styles.calRowHeader}>
                  {DOW.map((d, i) => (
                    <Text key={d} style={[styles.calHeaderCell, i === 0 && styles.calHeaderSunday]}>
                      {d}
                    </Text>
                  ))}
                </View>
                {grid.map((week, wi) => (
                  <View key={wi} style={styles.calRow}>
                    {week.map((cell, ci) => {
                      if (!cell) return <View key={ci} style={styles.calCell} />;
                      const isSunday = ci === 0;
                      const status = (cell.record?.status || '').toUpperCase();
                      const effectiveStatus = status || (isSunday ? 'WEEK_OFF' : null);
                      const dotColor = STATUS_COLORS[effectiveStatus];
                      return (
                        <View key={ci} style={styles.calCell}>
                          <Text style={[styles.calCellNum, isSunday && styles.calCellSunday]}>
                            {cell.day}
                          </Text>
                          {dotColor ? <View style={[styles.calDot, { backgroundColor: dotColor }]} /> : null}
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>

              <View style={styles.legendRow}>
                {[
                  ['Leave', STATUS_COLORS.LEAVE],
                  ['Late', STATUS_COLORS.LATE],
                  ['Permission', STATUS_COLORS.PERMISSION],
                  ['Week off', STATUS_COLORS.WEEK_OFF],
                  ['Holiday', STATUS_COLORS.HOLIDAY],
                ].map(([label, color]) => (
                  <View key={label} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: color }]} />
                    <Text style={styles.legendText}>{label}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        {!loading && lateDays.length > 0 && (
          <View style={[styles.card, { marginTop: 12 }]}>
            <View style={styles.lateHeader}>
              <View style={styles.lateAccent} />
              <Text style={styles.cardTitle}>Late Days Breakdown</Text>
              <View style={styles.lateTotalPill}>
                <Text style={styles.lateTotalText}>Total {late} Hrs</Text>
              </View>
            </View>
            {lateDays.map((r) => (
              <View key={r.date} style={styles.lateRow}>
                <View style={styles.lateRowLeft}>
                  <Text style={styles.lateRowDate}>{formatLateDate(r.date)}</Text>
                  <Text style={styles.lateRowSub}>Check-in {formatTime12(r.checkInTime)}</Text>
                </View>
                <View style={styles.lateRowPill}>
                  <Text style={styles.lateRowPillText}>{formatDuration(r._effectiveLateMinutes)}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
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

function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function formatLateDate(iso) {
  if (!iso) return '—';
  const parts = String(iso).split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  const dd = Number(parts[2]);
  if (!y || !m || !dd) return iso;
  const d = new Date(y, m - 1, dd);
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
  return `${dow}, ${pad2(dd)} ${mon} ${y}`;
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  content: { padding: 12, paddingBottom: 32 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

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

  lateHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  lateAccent: { width: 3, height: 16, borderRadius: 2, backgroundColor: '#DC2626', marginRight: 8 },
  lateTotalPill: { marginLeft: 'auto', backgroundColor: '#FEE2E2', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  lateTotalText: { fontSize: rf(11), fontWeight: '700', color: '#B91C1C' },
  lateRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  lateRowLeft: { flex: 1 },
  lateRowDate: { fontSize: rf(12), fontWeight: '700', color: '#111827' },
  lateRowSub: { fontSize: rf(10), color: '#6B7280', marginTop: 2 },
  lateRowPill: { backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  lateRowPillText: { fontSize: rf(12), fontWeight: '800', color: '#DC2626' },
});
