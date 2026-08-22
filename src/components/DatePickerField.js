import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
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
function CalendarBody({ initial, minimumDate, maximumDate, onCancel, onSave }) {
  const base = parseISO(initial) || new Date();
  const [selected, setSelected] = useState(parseISO(initial) ? initial : '');
  const [viewYear, setViewYear] = useState(base.getFullYear());
  const [viewMonth, setViewMonth] = useState(base.getMonth());

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

  return (
    <>
      <View style={styles.headerRow}>
        <Pressable style={styles.navBtn} hitSlop={8} onPress={() => stepMonth(-1)}>
          <Ionicons name="chevron-back" size={rf(18)} color="#00008B" />
        </Pressable>
        <Text style={styles.headerTitle}>{MONTHS[viewMonth]} {viewYear}</Text>
        <Pressable style={styles.navBtn} hitSlop={8} onPress={() => stepMonth(1)}>
          <Ionicons name="chevron-forward" size={rf(18)} color="#00008B" />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} style={styles.weekday}>{w}</Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((iso, i) => {
          if (!iso) return <View key={i} style={styles.cell} />;
          const day = Number(iso.slice(8, 10));
          const disabled = isDisabled(iso);
          const isSel = iso === selected;
          const isToday = iso === todayISO;
          return (
            <Pressable key={i} style={styles.cell} disabled={disabled} onPress={() => setSelected(iso)}>
              <View style={[styles.dayWrap, isSel && styles.daySelected, !isSel && isToday && styles.dayToday]}>
                <Text
                  style={[
                    styles.dayText,
                    disabled && styles.dayDisabled,
                    isSel && styles.daySelectedText,
                  ]}
                >
                  {day}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.cancelBtn} onPress={onCancel} hitSlop={8}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          style={[styles.saveBtn, !selected && styles.saveBtnDisabled]}
          hitSlop={8}
          disabled={!selected}
          onPress={() => onSave(selected)}
        >
          <Text style={styles.saveText}>Save</Text>
        </Pressable>
      </View>
    </>
  );
}

function CalendarModal({ visible, ...rest }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={rest.onCancel}>
      <Pressable style={styles.backdrop} onPress={rest.onCancel}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {visible ? <CalendarBody {...rest} /> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function DatePickerField({
  value,
  placeholder = 'Select date',
  onChange,
  minimumDate,
  maximumDate,
  disabled,
}) {
  const [open, setOpen] = useState(false);
  const display = formatDate(value);
  return (
    <>
      <Pressable
        style={[styles.field, disabled && styles.fieldDisabled]}
        onPress={() => { if (!disabled) setOpen(true); }}
      >
        <Ionicons name="calendar-outline" size={rf(16)} color={disabled ? '#94A3B8' : '#64748B'} />
        <Text
          style={[styles.fieldText, { color: display ? (disabled ? '#94A3B8' : '#0F172A') : '#94A3B8' }]}
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
  fieldDisabled: { backgroundColor: '#F1F5F9', borderColor: '#EEF2F7' },
  fieldText: { flex: 1, fontSize: rf(13) },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 20 },
  sheet: { backgroundColor: '#FFFFFF', borderRadius: 18, paddingTop: 14, paddingBottom: 10, paddingHorizontal: 12 },

  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  headerTitle: { fontSize: rf(15), fontWeight: '800', color: '#111827' },
  navBtn: {
    width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#EEF0FF',
  },

  weekRow: { flexDirection: 'row', marginBottom: 2 },
  weekday: { flex: 1, textAlign: 'center', fontSize: rf(11), fontWeight: '700', color: '#94A3B8', paddingVertical: 4 },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  dayWrap: { width: rf(34), height: rf(34), borderRadius: rf(17), alignItems: 'center', justifyContent: 'center' },
  dayText: { fontSize: rf(13), fontWeight: '600', color: '#111827' },
  dayDisabled: { color: '#CBD5E1', fontWeight: '400' },
  daySelected: { backgroundColor: '#00008B' },
  daySelectedText: { color: '#FFFFFF', fontWeight: '800' },
  dayToday: { borderWidth: 1.5, borderColor: '#00008B' },

  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 10 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  cancelText: { fontSize: rf(14), fontWeight: '700', color: '#6B7280' },
  saveBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, backgroundColor: '#00008B' },
  saveBtnDisabled: { opacity: 0.4 },
  saveText: { fontSize: rf(14), fontWeight: '700', color: '#FFFFFF' },
});
