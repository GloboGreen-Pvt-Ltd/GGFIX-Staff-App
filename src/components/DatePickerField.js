import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from './Typography';
import { Ionicons } from '@expo/vector-icons';
import { rf } from '../utils/responsive';

// A JS-only calendar date picker with a Cancel/Save modal — the sibling of
// TimePickerField, so the two form controls read as one system and neither
// pulls in a native module (works on the current dev client, no rebuild).
// Value in/out is an ISO "YYYY-MM-DD" string ('' = nothing picked yet).

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function pad2(n) { return String(n).padStart(2, '0'); }

// Local-midnight Date → "YYYY-MM-DD". Uses the device-local calendar day so the
// picked date matches what the user sees (no UTC off-by-one).
export function toISO(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// "YYYY-MM-DD" → Date (local midnight) or null. Rejects silently rolled-over
// dates (e.g. 2026-02-30 → Mar 2, 2026-13-40 → 2027).
export function parseISO(s) {
  if (!s || typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  if (mo < 1 || mo > 12 || day < 1 || day > 31) return null;
  const d = new Date(y, mo - 1, day);
  if (d.getFullYear() !== y || d.getMonth() !== mo - 1 || d.getDate() !== day) return null;
  return Number.isNaN(d.getTime()) ? null : d;
}

// "YYYY-MM-DD" → "29 Jul 2026". Exported for callers that render the chosen
// value elsewhere (e.g. a summary line). Empty/invalid → ''.
export function formatDate(iso) {
  const d = parseISO(iso);
  if (!d) return '';
  return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getFullYear()}`;
}

// Build a flat 6×7-style grid of ISO date strings (null for the padding cells
// before the 1st / after the last) for the given view month.
function buildGrid(viewYear, viewMonth) {
  const startDow = new Date(viewYear, viewMonth, 1).getDay();      // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(toISO(new Date(viewYear, viewMonth, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// The stateful calendar. Mounted only while the modal is visible (see
// CalendarModal) so each open re-initialises from the current value — mirrors
// TimePickerField's wheel remount trick.
function CalendarBody({ initial, minimumDate, maximumDate, onCancel, onSave, accent, title, monthOnly, yearOnly }) {
  const base = parseISO(initial) || new Date();
  const [selected, setSelected] = useState(parseISO(initial) ? initial : '');
  const [viewYear, setViewYear] = useState(base.getFullYear());
  const [viewMonth, setViewMonth] = useState(base.getMonth());
  // 'day' grid, or the 'month' / 'year' lists opened by tapping the header.
  const [mode, setMode] = useState(yearOnly ? 'year' : monthOnly ? 'month' : 'day');
  const minYear = parseISO(minimumDate)?.getFullYear() ?? Math.min(base.getFullYear(), new Date().getFullYear()) - 60;
  const maxYear = parseISO(maximumDate)?.getFullYear() ?? Math.max(base.getFullYear(), new Date().getFullYear()) + 10;
  const years = useMemo(() => {
    const out = [];
    for (let y = minYear; y <= maxYear; y++) out.push(y);
    return out;
  }, [minYear, maxYear]);
  const monthOutOfRange = (m) => {
    const first = toISO(new Date(viewYear, m, 1));
    const last = toISO(new Date(viewYear, m + 1, 0));
    return (minimumDate && last < minimumDate) || (maximumDate && first > maximumDate);
  };

  const todayISO = toISO(new Date());
  const cells = useMemo(() => buildGrid(viewYear, viewMonth), [viewYear, viewMonth]);

  // ISO strings in YYYY-MM-DD compare correctly lexicographically.
  const isDisabled = (iso) => {
    if (minimumDate && iso < minimumDate) return true;
    if (maximumDate && iso > maximumDate) return true;
    return false;
  };

  const stepMonth = (delta) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y--; } else if (m > 11) { m = 0; y++; }
    setViewMonth(m);
    setViewYear(y);
  };

  const DOWS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const sel = parseISO(selected);
  const tint = accent || '#035C6C';
  const bigLabel = yearOnly ? `${viewYear}` : monthOnly ? `${MONTHS[viewMonth]} ${viewYear}` : sel ? `${DOWS[sel.getDay()]}, ${MONTHS[sel.getMonth()].slice(0, 3)} ${sel.getDate()}` : 'Pick a date';

  return (
    <>
      <Text style={pk.label}>{title || 'Select date'}</Text>
      <Text style={pk.big}>{bigLabel}</Text>
      <View style={pk.divider} />

      <View style={pk.navRow}>
        <Pressable hitSlop={6} style={pk.monthBtn} onPress={() => setMode(mode === 'year' ? (monthOnly ? 'month' : 'day') : 'year')}>
          <Text style={pk.monthText}>{monthOnly ? viewYear : `${MONTHS[viewMonth]} ${viewYear}`}</Text>
          <Ionicons name={mode === 'year' ? 'caret-up' : 'caret-down'} size={rf(14)} color="#6B7280" />
        </Pressable>
        {mode === 'day' ? (
          <View style={{ flexDirection: 'row', gap: 18 }}>
            <Pressable hitSlop={10} onPress={() => stepMonth(-1)}><Ionicons name="chevron-back" size={rf(22)} color="#374151" /></Pressable>
            <Pressable hitSlop={10} onPress={() => stepMonth(1)}><Ionicons name="chevron-forward" size={rf(22)} color="#374151" /></Pressable>
          </View>
        ) : null}
      </View>

      {mode === 'year' ? (
        <ScrollView style={{ maxHeight: 300 }} contentContainerStyle={pk.yearGrid}>
          {years.map((y) => (
            <Pressable key={y} style={pk.yearCell} onPress={() => { setViewYear(y); if (yearOnly) onSave(toISO(new Date(y, 0, 1))); else setMode('month'); }}>
              <View style={[pk.yearPill, y === viewYear && { backgroundColor: tint }]}>
                <Text style={[pk.yearText, y === viewYear && { color: '#FFFFFF' }]}>{y}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ) : mode === 'month' ? (
        <View style={pk.yearGrid}>
          {MONTHS.map((name, m) => {
            const off = monthOutOfRange(m);
            return (
              <Pressable key={name} disabled={off} style={pk.yearCell} onPress={() => { setViewMonth(m); if (monthOnly) onSave(toISO(new Date(viewYear, m, 1))); else setMode('day'); }}>
                <View style={[pk.yearPill, m === viewMonth && { backgroundColor: tint }]}>
                  <Text style={[pk.yearText, m === viewMonth && { color: '#FFFFFF' }, off && { color: '#D1D5DB' }]}>{name.slice(0, 3)}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <>
          <View style={pk.weekRow}>
            {WEEKDAYS.map((d, i) => <Text key={i} style={pk.weekDay}>{d}</Text>)}
          </View>
          <View style={pk.grid}>
            {cells.map((iso, i) => {
              if (!iso) return <View key={i} style={pk.cell} />;
              const disabled = isDisabled(iso);
              const on = iso === selected;
              const today = iso === todayISO;
              return (
                <Pressable key={iso} disabled={disabled} style={pk.cell} onPress={() => setSelected(iso)}>
                  <View style={[pk.day, on && { backgroundColor: tint }, !on && today && { borderWidth: 1, borderColor: tint }]}>
                    <Text style={[pk.dayText, disabled && { color: '#C4C7CC' }, on && { color: '#FFFFFF', fontWeight: '700' }]}>{Number(iso.slice(8))}</Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      <View style={pk.actions}>
        <Pressable hitSlop={8} onPress={onCancel}><Text style={[pk.action, { color: tint }]}>Cancel</Text></Pressable>
        <Pressable hitSlop={8} disabled={!selected && !monthOnly && !yearOnly} onPress={() => onSave(yearOnly ? toISO(new Date(viewYear, 0, 1)) : monthOnly ? toISO(new Date(viewYear, viewMonth, 1)) : selected)}>
          <Text style={[pk.action, { color: selected || monthOnly || yearOnly ? tint : '#C4C7CC' }]}>OK</Text>
        </Pressable>
      </View>
    </>
  );
}

export function CalendarModal({ visible, ...rest }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={rest.onCancel}>
      <Pressable style={pk.backdrop} onPress={rest.onCancel}>
        <View style={pk.sheet} onStartShouldSetResponder={() => true}>
          {visible ? <CalendarBody {...rest} /> : null}
        </View>
      </Pressable>
    </Modal>
  );
}

// Bottom-sheet picker styles, shared look with TimePickerField.
export const pk = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 22, paddingTop: 22, paddingBottom: 18, width: '100%', maxWidth: 560, alignSelf: 'center' },
  label: { fontSize: rf(14), fontWeight: '600', color: '#4B5563', letterSpacing: 0.4 },
  big: { fontSize: rf(32), fontWeight: '500', color: '#111111', marginTop: 10 },
  divider: { height: 1, backgroundColor: '#E5E7EB', marginTop: 16, marginHorizontal: -6 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, marginBottom: 8 },
  monthBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  monthText: { fontSize: rf(16), fontWeight: '600', color: '#4B5563' },
  weekRow: { flexDirection: 'row', marginTop: 6 },
  weekDay: { flex: 1, textAlign: 'center', fontSize: rf(14), fontWeight: '500', color: '#111111', paddingVertical: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 46, alignItems: 'center', justifyContent: 'center' },
  day: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: rf(15), color: '#111111' },
  yearGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingVertical: 6 },
  yearCell: { width: '25%', paddingVertical: 6, alignItems: 'center' },
  yearPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  yearText: { fontSize: rf(15), color: '#111111' },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 36, marginTop: 14, paddingRight: 6 },
  action: { fontSize: rf(16), fontWeight: '700' },
});

export default function DatePickerField({
  value,
  placeholder = 'Select date',
  onChange,
  minimumDate,
  maximumDate,
  disabled,
  fieldStyle, // optional style override for the trigger field (e.g. a taller, rounder look)
  accent, // optional calendar accent colour (selected day, Save, arrows); defaults to navy
  accentSoft, // optional tint behind the month arrows
}) {
  const [open, setOpen] = useState(false);
  const display = formatDate(value);
  return (
    <>
      <Pressable
        style={[styles.field, fieldStyle, disabled && styles.fieldDisabled]}
        onPress={() => { if (!disabled) setOpen(true); }}
      >
        <Ionicons name="calendar-outline" size={rf(16)} color={disabled ? '#94A3B8' : '#6B7280'} />
        <Text
          style={[styles.fieldText, { color: display ? (disabled ? '#94A3B8' : '#111111') : '#94A3B8' }]}
          numberOfLines={1}
        >
          {display || placeholder}
        </Text>
        {!disabled ? <Ionicons name="chevron-down" size={rf(16)} color="#94A3B8" /> : null}
      </Pressable>
      <CalendarModal
        visible={open}
        initial={value}
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        onCancel={() => setOpen(false)}
        onSave={(v) => { onChange?.(v); setOpen(false); }}
        accent={accent}
        accentSoft={accentSoft}
      />
    </>
  );
}

const styles = StyleSheet.create({
  // Trigger field — matched to TimePickerField so date + time controls are twins.
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 12,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  fieldDisabled: { backgroundColor: '#F3F4F6', borderColor: '#EEF2F7' },
  fieldText: { flex: 1, fontSize: rf(13) },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 20 },
  sheet: { backgroundColor: '#FFFFFF', borderRadius: 18, paddingTop: 14, paddingBottom: 10, paddingHorizontal: 12 },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  headerTitle: { fontSize: rf(15), fontWeight: '800', color: '#111111' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  pickGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  pickCell: { width: '33.333%', height: 48, padding: 4 },
  pickItem: { flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F6F8' },
  yearList: { maxHeight: 48 * 5 },
  navBtn: {
    width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#EEF0FF',
  },

  weekRow: { flexDirection: 'row', marginBottom: 2 },
  weekday: { flex: 1, textAlign: 'center', fontSize: rf(11), fontWeight: '700', color: '#94A3B8', paddingVertical: 4 },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayWrap: { width: rf(34), height: rf(34), borderRadius: rf(17), alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: rf(13), fontWeight: '600', color: '#111111' },
  dayDisabled: { color: '#E5E7EB', fontWeight: '400' },
  daySelected: { backgroundColor: '#035C6C' },
  daySelectedText: { color: '#FFFFFF', fontWeight: '800' },
  dayToday: { borderWidth: 1.5, borderColor: '#035C6C' },

  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 10 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  cancelText: { fontSize: rf(14), fontWeight: '700', color: '#6B7280' },
  saveBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, backgroundColor: '#035C6C' },
  saveBtnDisabled: { opacity: 0.4 },
  saveText: { fontSize: rf(14), fontWeight: '700', color: '#FFFFFF' },
});
