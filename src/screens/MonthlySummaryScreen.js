import React, { useState, useCallback, useMemo } from 'react';
import { View, StyleSheet, ScrollView, ActivityIndicator, RefreshControl, useWindowDimensions } from 'react-native';
import { Text } from '../components/Typography';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CalendarCheck,
  CalendarDays,
  ChartColumn,
  ClipboardList,
  Clock3,
  UserRound,
} from 'lucide-react-native';
import { useSelector } from 'react-redux';
import { ticketApi } from '../api/client';
import { useTechnicianIdState } from '../auth/useTechnicianId';
import TechIdPending from '../components/TechIdPending';
import { selectSession } from '../store/authSlice';
import { effectiveLateMinutes } from './DailyAttendanceScreen';
import { rf, rlh, rs } from '../utils/responsive';
import MintScreenHeader, { MintBackdrop, useHideNativeHeader } from '../components/MintScreenHeader';
import { BadgeIconTile, MonthPill } from '../components/MintKit';

// Screen palette (Near G Fix green + mint).
const C = {
  deep: '#035C6C',
  primary: '#035C6C',
  bright: '#035C6C',
  mint: '#E5F3F5',
  softMint: '#E5F3F5',
  bg: '#F3F4F6',
  card: '#FFFFFF',
  border: '#E5E7EB',
  text: '#111111',
  muted: '#6B7280',
  softRed: '#FEECEC',
};
const MAX_CONTENT_WIDTH = 720;

// Monthly Summary = the Attendance Overview card (stat rings + calendar +
// legend). The day-by-day "Attendance Monthly" list lives on the separate
// Daily Attendance screen.

const DOW = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const STATUS_COLORS = {
  PRESENT: '#609138',
  ABSENT: '#F32C26',
  LEAVE: '#0788C9',
  LATE: '#FAA700',
  PERMISSION: '#1C3053',
  WEEK_OFF: '#BDBDBD',
  HOLIDAY: '#035C6C',
};
const RING_COLORS = {
  present: '#609138',
  late: '#FAA700',
  permission: '#0788C9',
  leaves: '#F32C26',
  holidays: '#1C3053',
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

export default function MonthlySummaryScreen({ navigation }) {
  useHideNativeHeader(navigation);
  const { width: winW } = useWindowDimensions();
  const { id: technicianId, failed: techIdFailed, retry: retryTechId } = useTechnicianIdState();
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

  if (!technicianId) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <MintBackdrop />
        <MintScreenHeader title="Monthly Summary" navigation={navigation} />
        <TechIdPending failed={techIdFailed} onRetry={retryTechId} />
      </SafeAreaView>
    );
  }

  // Layout maths: 5 KPI cards always share one row; widths come from the card's
  // inner width so the fifth card never clips.
  const contentW = Math.min(winW, MAX_CONTENT_WIDTH) - rs(32);
  const cardInnerW = contentW - rs(12) * 2 - 2;
  const kpiGap = rs(8);
  const kpiW = (cardInnerW - kpiGap * 4) / 5;
  const ringSize = Math.min(kpiW - rs(10), rs(54));
  // Month control sits top-right when there's room, under the title otherwise.
  const monthInline = contentW >= 400;

  const arrowBtn = { width: rs(28), height: rs(28), borderRadius: rs(14), backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center' };
  const monthControl = <MonthPill month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MintBackdrop />
      <MintScreenHeader title="Monthly Summary" navigation={navigation} />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} colors={[C.deep]} tintColor={C.deep} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ width: contentW }}>
          {/* Attendance Overview + month selector + KPI cards */}
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <View style={styles.headerTitleWrap}>
                <View style={styles.iconTile}>
                  <ChartColumn size={rs(18)} color="#035C6C" strokeWidth={2.6} />
                </View>
                <Text style={styles.cardTitle} numberOfLines={1}>This Month</Text>
              </View>
              {monthControl}
            </View>

            {loading && !data ? (
              <ActivityIndicator size="large" color={C.deep} style={{ marginVertical: rs(24) }} />
            ) : (
              <View style={[styles.statRow, { gap: kpiGap }]}>
                <KpiCard width={kpiW} ring={ringSize} icon={UserRound} value={present} label="Present" color={RING_COLORS.present} bg="#D3E5C3" />
                <KpiCard width={kpiW} ring={ringSize} icon={Clock3} value={late} label="Late Hrs" color={RING_COLORS.late} bg="#FFDCAE" />
                <KpiCard width={kpiW} ring={ringSize} icon={ClipboardList} value={String(permission)} label="Permission" color={RING_COLORS.permission} bg="#DCCDFB" />
                <KpiCard width={kpiW} ring={ringSize} icon={CalendarDays} value={String(leaves)} label="Leaves" color={RING_COLORS.leaves} bg="#FBCFCF" />
                <KpiCard width={kpiW} ring={ringSize} icon={CalendarCheck} value={String(holidays)} label="Holidays" color={RING_COLORS.holidays} bg="#C3E2E7" />
              </View>
            )}
          </View>

          {/* Calendar + legend */}
          {loading && !data ? null : (
            <View style={[styles.card, { marginTop: rs(8) }]}>
              <View style={styles.calRowHeader}>
                {DOW.map((d, i) => (
                  <Text key={d} style={[styles.calHeaderCell, i === 0 && styles.calHeaderSunday]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                    {d}
                  </Text>
                ))}
              </View>
              {grid.map((week, wi) => (
                <View key={wi} style={styles.calRow}>
                  {week.map((cell, ci) => {
                    if (!cell) return <View key={ci} style={styles.calCell} />;
                    const isSunday = ci === 0;
                    const status = String(cell.record?.status || (cell.record?.checkInTime ? 'PRESENT' : '')).toUpperCase();
                    // A past working day with no record counts as absent (same rule as Daily Attendance).
                    const effectiveStatus = status || (isSunday ? 'WEEK_OFF' : cell.iso < todayIsoString() ? 'ABSENT' : null);
                    const dotColor = STATUS_COLORS[effectiveStatus];
                    const isToday = cell.iso === todayIsoString();
                    const tint = isToday ? '#035C6C' : effectiveStatus !== 'WEEK_OFF' ? dotColor : null;
                    return (
                      <View key={ci} style={styles.calCell}>
                        <View style={[styles.calCircle, tint ? { backgroundColor: isToday ? tint : `${tint}2E` } : null]}>
                          <Text style={[styles.calCellNum, isSunday && { color: '#9CA3AF' }, tint ? { color: isToday ? '#FFFFFF' : tint, fontWeight: '700' } : null]}>
                            {cell.day}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))}

              <View style={styles.legendRow}>
                {[
                  ['Present', STATUS_COLORS.PRESENT],
                  ['Late', STATUS_COLORS.LATE],
                  ['Absent', STATUS_COLORS.ABSENT],
                  ['Leave', STATUS_COLORS.LEAVE],
                  ['Permission', STATUS_COLORS.PERMISSION],
                  ['Holiday', STATUS_COLORS.HOLIDAY],
                ].map(([label, color]) => (
                  <View key={label} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: color }]} />
                    <Text style={styles.legendText}>{label}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function KpiCard({ icon, value, label, color }) {
  return <BadgeIconTile icon={icon} color={color} label={label} count={value} size={rs(42)} />;
}

const cardShadow = {
  shadowColor: '#111111', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  content: { alignItems: 'center', paddingTop: rs(2), paddingBottom: rs(16) },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  card: {
    backgroundColor: C.card, borderRadius: rs(16), borderWidth: 1, borderColor: C.border,
    padding: rs(10), ...cardShadow,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitleWrap: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: rs(8) },
  iconTile: {
    width: rs(36), height: rs(36), borderRadius: rs(11), backgroundColor: C.mint,
    alignItems: 'center', justifyContent: 'center', marginRight: rs(9),
  },
  cardTitle: { fontSize: rf(16), fontWeight: '800', color: '#1C3053', lineHeight: rlh(20), flexShrink: 1 },

  monthPill: {
    flexDirection: 'row', alignItems: 'center', gap: rs(6),
    backgroundColor: C.deep, borderRadius: rs(12),
    paddingLeft: rs(10), paddingRight: rs(4), paddingVertical: rs(4),
  },
  monthPillStacked: { marginTop: rs(8) },
  monthPillText: { color: '#FFFFFF', fontSize: rf(13), fontWeight: '700', flexShrink: 1 },
  monthStepGroup: {
    flexDirection: 'row', alignItems: 'center', borderRadius: rs(10),
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  monthStepBtn: { paddingHorizontal: rs(7), paddingVertical: rs(4) },
  monthPillSep: { width: 1, height: rs(14), backgroundColor: 'rgba(255,255,255,0.35)' },

  statRow: { flexDirection: 'row', marginTop: rs(10) },
  kpiCard: { alignItems: 'center', borderRadius: rs(14), borderWidth: 1, paddingTop: rs(8), paddingBottom: rs(7) },
  kpiRing: {
    borderWidth: 3, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#FFFFFF', paddingHorizontal: 3,
  },
  kpiValue: { fontSize: rf(12), fontWeight: '800', color: C.text, marginTop: 1 },
  kpiLabel: { fontSize: rf(10.5), fontWeight: '600', color: C.text, marginTop: 1, paddingHorizontal: 2 },

  calRowHeader: {
    flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: rs(11),
    paddingVertical: rs(6), marginBottom: rs(4),
  },
  calRow: { flexDirection: 'row' },
  calCircle: { width: rs(32), height: rs(32), borderRadius: rs(16), alignItems: 'center', justifyContent: 'center' },
  calCell: { flex: 1, height: rs(42), alignItems: 'center', justifyContent: 'center' },
  calBox: { borderRadius: rs(10), backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  calBoxSunday: { backgroundColor: '#FEECEC', borderColor: '#FBD3D3' },
  calHeaderCell: { flex: 1, textAlign: 'center', fontSize: rf(10.5), fontWeight: '700', color: C.text },
  calHeaderSunday: { color: '#F32C26' },
  calCellNum: { fontSize: rf(13.5), fontWeight: '600', color: C.text },
  calCellSunday: { color: '#F32C26' },
  calDot: { width: rs(6), height: rs(6), borderRadius: rs(3), marginTop: rs(2) },

  legendRow: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: rs(10), rowGap: rs(4),
    backgroundColor: '#F3F4F6', borderRadius: rs(11), paddingVertical: rs(7), paddingHorizontal: rs(6), marginTop: rs(6),
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: rs(4) },
  legendDot: { width: rs(8), height: rs(8), borderRadius: rs(4) },
  legendText: { fontSize: rf(11), color: C.text, fontWeight: '500' },

  lateHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: rs(2) },
  lateIcon: {
    width: rs(32), height: rs(32), borderRadius: rs(16), backgroundColor: C.mint,
    alignItems: 'center', justifyContent: 'center', marginRight: rs(9),
  },
  lateTitle: { flex: 1, flexShrink: 1, fontSize: rf(16), fontWeight: '800', color: '#1C3053', marginRight: rs(8) },
  lateTotalPill: { backgroundColor: C.softRed, paddingHorizontal: rs(10), paddingVertical: rs(4), borderRadius: 999 },
  lateTotalText: { fontSize: rf(12), fontWeight: '700', color: '#F32C26' },
  lateRow: {
    flexDirection: 'row', alignItems: 'center', marginTop: rs(7), minHeight: rs(52),
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: rs(13), paddingHorizontal: rs(10), paddingVertical: rs(7),
    backgroundColor: C.card,
  },
  lateRowIcon: {
    width: rs(32), height: rs(32), borderRadius: rs(16), backgroundColor: C.mint,
    alignItems: 'center', justifyContent: 'center', marginRight: rs(10),
  },
  lateRowLeft: { flex: 1, marginRight: rs(8) },
  lateRowDate: { fontSize: rf(13.5), fontWeight: '700', color: C.text },
  lateRowSub: { fontSize: rf(11.5), color: C.muted, marginTop: 1 },
  lateRowPill: {
    backgroundColor: C.softRed, borderColor: '#FBD0D0', borderWidth: 1,
    paddingHorizontal: rs(10), paddingVertical: rs(3), borderRadius: rs(10),
  },
  lateRowPillText: { fontSize: rf(12.5), fontWeight: '800', color: '#F32C26' },
});
function todayIsoString() { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`; }
