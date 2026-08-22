import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import { ticketApi } from '../api/client';
import { useTechnicianId } from '../auth/useTechnicianId';
import { selectSession } from '../store/authSlice';
import { effectiveLateMinutes } from './DailyAttendanceScreen';
import { rf, rlh } from '../utils/responsive';

const DEFAULT_DUTY_CHECK_IN = '09:30:00';

const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Default duty window (9 AM–10 PM). The rendered range widens at runtime to
// include any check-in/out that falls outside it (see scheduleHours below), so
// an early check-in or a late check-out is never silently dropped.
const DEFAULT_SCHEDULE_START = 9;
const DEFAULT_SCHEDULE_END = 22;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function ampmOf(h24) {
  return h24 >= 12 ? 'PM' : 'AM';
}

function hourLabel(h24) {
  const h12 = ((h24 + 11) % 12) + 1;
  return `${pad2(h12)}:00 ${ampmOf(h24)}`;
}

function parseTime(t) {
  if (!t || typeof t !== 'string') return null;
  const [hh, mm] = t.split(':');
  const hour = Number(hh);
  const minute = Number(mm || 0);
  if (Number.isNaN(hour)) return null;
  const h12 = ((hour + 11) % 12) + 1;
  // Include AM/PM — a 13:30 check-out rendered as "(01:30)" was indistinguishable
  // from 1:30 AM.
  return { hour, minute, label: `${pad2(h12)}:${pad2(minute)} ${ampmOf(hour)}` };
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
  // Build a LOCAL date from "YYYY-MM-DD". `new Date("YYYY-MM-DD")` parses as UTC
  // midnight, so in any negative-UTC timezone the header/weekday render a day
  // early — the same trap isoDate() above was written to avoid.
  const [y, m, d] = String(str).split('-').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}

function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export default function DailyShiftScheduleScreen() {
  const technicianId = useTechnicianId();
  const session = useSelector(selectSession);
  const dutyCheckIn = session?.defaultCheckIn || DEFAULT_DUTY_CHECK_IN;
  const todayIso = isoDate(new Date());
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [dayData, setDayData] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadDay = useCallback(async (dateStr) => {
    if (!technicianId) return;
    setLoading(true);
    try {
      const res = await ticketApi.get(`/technicians/${technicianId}/attendance/day`, {
        query: { date: dateStr },
      });
      setDayData(res);
    } catch {
      setDayData(null);
    } finally {
      setLoading(false);
    }
  }, [technicianId]);

  React.useEffect(() => {
    loadDay(selectedDate);
  }, [selectedDate, loadDay]);

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
  const duty = parseTime(dutyCheckIn);
  // Use the shared helper so this screen's "Late by Xh Ym" matches the Late
  // HR's column on the Daily Attendance screen for the same date.
  const lateMinutes = effectiveLateMinutes(dayData, dutyCheckIn);
  const isLate = lateMinutes > 0;

  // Widen the timeline to include any event outside the default 9 AM–10 PM
  // window. Without this, a check-in at 08:50 (or a check-out after 22:59)
  // rendered no chip at all — while its truthy value suppressed the
  // "No attendance recorded" note, so the day looked empty.
  const eventHours = [checkIn?.hour, checkOut?.hour, duty?.hour].filter(
    (h) => typeof h === 'number' && !Number.isNaN(h),
  );
  const startHour = Math.min(DEFAULT_SCHEDULE_START, ...eventHours);
  const endHour = Math.max(DEFAULT_SCHEDULE_END, ...eventHours);
  const scheduleHours = Array.from(
    { length: endHour - startHour + 1 },
    (_, i) => startHour + i,
  );

  if (!technicianId) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.center}><ActivityIndicator color="#00008B" /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerDate}>{selected.getDate()}</Text>
          <View>
            <Text style={styles.headerDayLong}>{dayLong}</Text>
            <Text style={styles.headerMonth}>{monthYear}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.todayBtn}
          onPress={() => setSelectedDate(todayIso)}
          activeOpacity={0.85}
        >
          <Text style={styles.todayBtnText}>Today</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.weekStripContent}
      >
        {weekDays.map((dt) => {
          const dateStr = isoDate(dt);
          const isSelected = dateStr === selectedDate;
          const isSunday = dt.getDay() === 0;
          return (
            <TouchableOpacity
              key={dateStr}
              style={[
                styles.weekDay,
                isSunday && !isSelected && styles.weekDaySunday,
                isSelected && styles.weekDaySelected,
              ]}
              onPress={() => setSelectedDate(dateStr)}
              activeOpacity={0.85}
            >
              <Text
                style={[
                  styles.weekDayName,
                  isSunday && !isSelected && styles.weekDayTextSunday,
                  isSelected && styles.weekDayTextSelected,
                ]}
              >
                {DAYS_SHORT[dt.getDay()]}
              </Text>
              <Text
                style={[
                  styles.weekDayNum,
                  isSunday && !isSelected && styles.weekDayTextSunday,
                  isSelected && styles.weekDayTextSelected,
                ]}
              >
                {pad2(dt.getDate())}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.scheduleContent}>
        <Text style={styles.scheduleTitle}>Schedule</Text>

        {loading ? (
          <ActivityIndicator size="small" color="#00008B" style={{ marginVertical: 24 }} />
        ) : (
          <View style={styles.timeline}>
            {scheduleHours.map((h) => {
              const isCheckIn = checkIn && checkIn.hour === h;
              const isCheckOut = checkOut && checkOut.hour === h;
              const isDuty = duty && duty.hour === h;
              return (
                <View key={h} style={styles.hourRow}>
                  <View style={styles.hourPill}>
                    <Text style={styles.hourPillText}>{hourLabel(h)}</Text>
                  </View>
                  <View style={styles.hourLineWrap}>
                    <View style={styles.hourLine} />
                    {isDuty && !isCheckIn && (
                      <View style={[styles.eventChip, styles.eventChipDuty]}>
                        <Text style={styles.eventChipDutyText}>Duty Start</Text>
                        <Text style={styles.eventChipDutyTime}>({duty.label})</Text>
                      </View>
                    )}
                    {isCheckIn && (
                      <View style={[styles.eventChip, isLate ? styles.eventChipLate : styles.eventChipCheckIn]}>
                        <Text style={isLate ? styles.eventChipLateText : styles.eventChipText}>
                          {isLate ? `Check-In Late by ${formatDuration(lateMinutes)}` : 'Check-In Time'}
                        </Text>
                        <Text style={isLate ? styles.eventChipLateTime : styles.eventChipTime}>
                          ({checkIn.label})
                        </Text>
                      </View>
                    )}
                    {isCheckOut && (
                      <View style={[styles.eventChip, styles.eventChipCheckOut]}>
                        <Text style={styles.eventChipText}>Check-Out Time</Text>
                        <Text style={styles.eventChipTime}>({checkOut.label})</Text>
                      </View>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {!loading && !checkIn && !checkOut && (
          <Text style={styles.empty}>No attendance recorded for this day.</Text>
        )}

        {dayData?.status && dayData.status !== 'GENERAL' && (
          <View style={styles.statusNote}>
            <Text style={styles.statusNoteText}>
              {dayData.status}
              {dayData.notes ? ` — ${dayData.notes}` : ''}
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FFFFFF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerDate: { fontSize: rf(28), fontWeight: '800', color: '#111827', lineHeight: rlh(30) },
  headerDayLong: { fontSize: rf(13), fontWeight: '600', color: '#111827' },
  headerMonth: { fontSize: rf(11), color: '#6B7280', marginTop: 1 },
  todayBtn: { backgroundColor: '#DCFCE7', borderWidth: 1, borderColor: '#004C40', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  todayBtnText: { color: '#004C40', fontSize: rf(12), fontWeight: '700' },

  weekStripContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  weekDay: { width: 46, paddingVertical: 8, alignItems: 'center', borderRadius: 8, backgroundColor: '#FFFFFF' },
  weekDaySelected: { backgroundColor: '#004C40' },
  weekDaySunday: { backgroundColor: '#EF4444' },
  weekDayName: { fontSize: rf(11), color: '#6B7280', fontWeight: '600' },
  weekDayNum: { fontSize: rf(15), fontWeight: '800', color: '#111827', marginTop: 2 },
  weekDayTextSelected: { color: '#FFFFFF' },
  weekDayTextSunday: { color: '#FFFFFF' },

  scheduleContent: { paddingHorizontal: 14, paddingTop: 8, paddingBottom: 32 },
  scheduleTitle: { fontSize: rf(14), fontWeight: '700', color: '#111827', marginBottom: 10 },

  timeline: { backgroundColor: 'transparent' },
  hourRow: { flexDirection: 'row', alignItems: 'center', minHeight: 42 },
  hourPill: { width: 56, paddingVertical: 4, borderRadius: 999, backgroundColor: '#9CA3AF', alignItems: 'center', marginRight: 10 },
  hourPillText: { fontSize: rf(11), fontWeight: '700', color: '#FFFFFF' },
  hourLineWrap: { flex: 1, justifyContent: 'center', minHeight: 30 },
  hourLine: { height: 1, borderStyle: 'dashed', borderWidth: 0.5, borderColor: '#C7CDDB' },

  eventChip: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  eventChipCheckIn: { backgroundColor: '#DCFCE7' },
  eventChipCheckOut: { backgroundColor: '#DCFCE7' },
  eventChipText: { fontSize: rf(12), fontWeight: '700', color: '#004C40' },
  eventChipTime: { fontSize: rf(11), fontWeight: '600', color: '#004C40' },
  eventChipDuty: { backgroundColor: '#E0E7FF', borderWidth: 1, borderColor: '#6366F1', borderStyle: 'dashed' },
  eventChipDutyText: { fontSize: rf(12), fontWeight: '700', color: '#3730A3' },
  eventChipDutyTime: { fontSize: rf(11), fontWeight: '600', color: '#3730A3' },
  eventChipLate: { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#FCA5A5' },
  eventChipLateText: { fontSize: rf(12), fontWeight: '800', color: '#B91C1C' },
  eventChipLateTime: { fontSize: rf(11), fontWeight: '700', color: '#B91C1C' },

  empty: { fontSize: rf(13), color: '#6B7280', textAlign: 'center', marginTop: 16 },

  statusNote: { marginTop: 14, backgroundColor: '#FEF3C7', borderRadius: 8, padding: 10 },
  statusNoteText: { fontSize: rf(12), fontWeight: '600', color: '#92400E' },
});
