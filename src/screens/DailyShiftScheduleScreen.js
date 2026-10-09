import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar, Clock, LogIn, LogOut } from 'lucide-react-native';
import { useSelector } from 'react-redux';
import { ticketApi } from '../api/client';
import { useTechnicianIdState } from '../auth/useTechnicianId';
import TechIdPending from '../components/TechIdPending';
import { selectSession } from '../store/authSlice';
import { effectiveLateMinutes } from './DailyAttendanceScreen';
import { rf, rlh, rs } from '../utils/responsive';
import MintScreenHeader, { MintBackdrop, useHideNativeHeader } from '../components/MintScreenHeader';

// Screen palette (GGFIX green + mint).
const C = {
  deep: '#09AD2A',
  primary: '#09AD2A',
  green: '#09AD2A',
  mint: '#E6F7EA',
  softMint: '#F3FBF4',
  bg: '#F8F8F8',
  card: '#FFFFFF',
  border: '#E6E6E6',
  text: '#1E1E1E',
  muted: '#6E6E6E',
  // Duty-start events: yellow from the palette (blue isn't in it).
  blue: '#F3BF23',
  softBlue: '#FEFAF0',
  red: '#F84141',
  softRed: '#FEECEC',
};
const MAX_CONTENT_WIDTH = 720;

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

export default function DailyShiftScheduleScreen({ navigation }) {
  useHideNativeHeader(navigation);
  const { width: winW } = useWindowDimensions();
  const { id: technicianId, failed: techIdFailed, retry: retryTechId } = useTechnicianIdState();
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

  const contentW = Math.min(winW, MAX_CONTENT_WIDTH) - rs(32);
  const isTodaySelected = selectedDate === todayIso;

  if (!technicianId) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <MintBackdrop />
        <MintScreenHeader title="Daily Shift Schedule" navigation={navigation} />
        <TechIdPending failed={techIdFailed} onRetry={retryTechId} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <MintBackdrop />
      <MintScreenHeader title="Daily Shift Schedule" navigation={navigation} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={{ width: contentW }}>
          {/* Selected date + week strip */}
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                <Text style={styles.headerDate}>{selected.getDate()}</Text>
                <View style={{ flexShrink: 1 }}>
                  <Text style={styles.headerDayLong} numberOfLines={1}>{dayLong}</Text>
                  <Text style={styles.headerMonth} numberOfLines={1}>{monthYear}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.todayBtn, isTodaySelected && styles.todayBtnActive]}
                onPress={() => setSelectedDate(todayIso)}
                activeOpacity={0.85}
              >
                <Text style={styles.todayBtnText}>Today</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.weekStrip}>
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
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      {DAYS_SHORT[dt.getDay()]}
                    </Text>
                    <Text
                      style={[
                        styles.weekDayNum,
                        isSunday && !isSelected && styles.weekDayTextSunday,
                        isSelected && styles.weekDayTextSelected,
                      ]}
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

          {/* Schedule timeline */}
          <View style={[styles.card, { marginTop: rs(14) }]}>
            <Text style={styles.scheduleTitle}>Schedule</Text>

            {loading ? (
              <ActivityIndicator size="small" color={C.deep} style={{ marginVertical: rs(24) }} />
            ) : (
              <View>
                {scheduleHours.map((h, idx) => {
                  const isCheckIn = checkIn && checkIn.hour === h;
                  const isCheckOut = checkOut && checkOut.hour === h;
                  const isDuty = duty && duty.hour === h;
                  // Events stack in normal flow (not absolutely overlaid) so two
                  // events in the same hour can never cover each other.
                  const events = [];
                  if (isDuty && !isCheckIn) {
                    events.push(
                      <EventChip key="duty" tone="duty" icon={Calendar} label="Duty Start" time={duty.label} />,
                    );
                  }
                  if (isCheckIn) {
                    events.push(
                      <EventChip
                        key="in"
                        tone={isLate ? 'late' : 'ok'}
                        icon={isLate ? Clock : LogIn}
                        label={isLate ? `Check-In Late by ${formatDuration(lateMinutes)}` : 'Check-In Time'}
                        time={checkIn.label}
                      />,
                    );
                  }
                  if (isCheckOut) {
                    events.push(
                      <EventChip key="out" tone="ok" icon={LogOut} label="Check-Out Time" time={checkOut.label} />,
                    );
                  }
                  const dotColor = isCheckIn ? (isLate ? C.red : C.green)
                    : isDuty ? C.blue
                    : isCheckOut ? C.green
                    : null;
                  return (
                    <View key={h} style={styles.hourRow}>
                      <View style={styles.hourPill}>
                        <Text style={styles.hourPillText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{hourLabel(h)}</Text>
                      </View>
                      <View style={styles.markerCol}>
                        <View style={[
                          styles.markerLine,
                          idx === 0 && { top: '50%' },
                          idx === scheduleHours.length - 1 && { bottom: '50%' },
                        ]} />
                        <View style={dotColor ? [styles.markerDotActive, { backgroundColor: dotColor }] : styles.markerDot} />
                      </View>
                      <View style={styles.hourContent}>
                        {events.length ? events : <View style={styles.hourLine} />}
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
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const EVENT_TONES = {
  duty: { bg: C.softBlue, border: '#F7E3A6', iconBg: '#FDF2D0', iconColor: '#1E1E1E', text: C.text },
  late: { bg: C.softRed, border: '#FBD0D0', iconBg: C.red, iconColor: '#FFFFFF', text: C.text },
  ok:   { bg: C.mint, border: '#CDEFD5', iconBg: '#FFFFFF', iconColor: C.green, text: C.text },
};

function EventChip({ tone, icon: Icon, label, time }) {
  const t = EVENT_TONES[tone];
  const circle = rs(26);
  return (
    <View style={[styles.eventChip, { backgroundColor: t.bg, borderColor: t.border }]}>
      <View style={{ width: circle, height: circle, borderRadius: circle / 2, backgroundColor: t.iconBg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={rs(14)} color={t.iconColor} strokeWidth={2.4} />
      </View>
      <Text style={[styles.eventLabel, { color: t.text }]} numberOfLines={2}>{label}</Text>
      <Text style={[styles.eventTime, { color: t.text }]} numberOfLines={1}>({time})</Text>
    </View>
  );
}

const cardShadow = {
  shadowColor: '#1E1E1E', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
};

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { alignItems: 'center', paddingTop: rs(2), paddingBottom: rs(16) },

  card: {
    backgroundColor: C.card, borderRadius: rs(16), borderWidth: 1, borderColor: C.border,
    padding: rs(11), ...cardShadow,
  },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: rs(10), flex: 1, marginRight: rs(8) },
  headerDate: { fontSize: rf(34), fontWeight: '800', color: C.text, lineHeight: rlh(40) },
  headerDayLong: { fontSize: rf(16), fontWeight: '800', color: C.text },
  headerMonth: { fontSize: rf(12.5), color: C.muted, marginTop: 1 },
  todayBtn: {
    backgroundColor: C.card, borderWidth: 1, borderColor: '#CDEFD5',
    paddingHorizontal: rs(14), paddingVertical: rs(6), borderRadius: rs(11),
  },
  todayBtnActive: { backgroundColor: C.mint, borderColor: C.green },
  todayBtnText: { color: C.text, fontSize: rf(13), fontWeight: '700' },

  weekStrip: { flexDirection: 'row', gap: rs(5), marginTop: rs(10) },
  weekDay: {
    flex: 1, paddingVertical: rs(6), alignItems: 'center', borderRadius: rs(11),
    backgroundColor: '#F3F3F3', borderWidth: 1, borderColor: '#EDEDED',
  },
  weekDaySelected: { backgroundColor: C.green, borderColor: C.green },
  weekDaySunday: { backgroundColor: C.softRed, borderColor: '#FBD0D0' },
  weekDayName: { fontSize: rf(11), color: C.muted, fontWeight: '600' },
  weekDayNum: { fontSize: rf(15), fontWeight: '800', color: C.text, marginTop: 1 },
  weekDayTextSelected: { color: '#FFFFFF' },
  weekDayTextSunday: { color: C.red },

  scheduleTitle: { fontSize: rf(16), fontWeight: '800', color: C.text, marginBottom: rs(6) },

  hourRow: { flexDirection: 'row', alignItems: 'center', minHeight: rs(36) },
  hourPill: {
    width: rs(72), paddingVertical: rs(3), borderRadius: 999, backgroundColor: '#F3F3F3',
    alignItems: 'center',
  },
  hourPillText: { fontSize: rf(11), fontWeight: '600', color: C.text },
  markerCol: { width: rs(22), alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  markerLine: { position: 'absolute', top: 0, bottom: 0, width: 1.5, backgroundColor: '#E6E6E6' },
  markerDot: { width: rs(7), height: rs(7), borderRadius: rs(4), backgroundColor: '#D4D4D4' },
  markerDotActive: { width: rs(11), height: rs(11), borderRadius: rs(6), borderWidth: 2.5, borderColor: '#FFFFFF' },
  hourContent: { flex: 1, justifyContent: 'center', paddingVertical: rs(3), gap: rs(5) },
  hourLine: { height: 1, borderStyle: 'dashed', borderWidth: 0.5, borderColor: '#DDDDDD' },

  eventChip: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: rs(11),
    paddingHorizontal: rs(8), paddingVertical: rs(5),
  },
  eventLabel: { flex: 1, fontSize: rf(12.5), fontWeight: '700', marginLeft: rs(8) },
  eventTime: { fontSize: rf(12), fontWeight: '600', marginLeft: rs(6) },

  empty: { fontSize: rf(12.5), color: C.muted, textAlign: 'center', marginTop: rs(12) },

  statusNote: { marginTop: rs(10), backgroundColor: '#FDF6E0', borderRadius: rs(11), padding: rs(10) },
  statusNoteText: { fontSize: rf(12), fontWeight: '600', color: C.text },
});
