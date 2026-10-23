import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { pk } from './DatePickerField';
import { Text } from './Typography';
import { Ionicons } from '@expo/vector-icons';
import { rf } from '../utils/responsive';

// A JS-only wheel time picker (Hour · Minute · AM/PM) with a Cancel/Save modal —
// mirrors the native "Select time" spinner without pulling in a native module,
// so it works on the current dev client with no rebuild. Value in/out is a 24h
// "HH:MM" string ('' = nothing picked yet).

const ITEM_HEIGHT = 44;
const VISIBLE = 5;               // odd → clean centre row
const PAD = ITEM_HEIGHT * ((VISIBLE - 1) / 2);

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));   // 01..12
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));      // 00..59
const PERIODS = ['AM', 'PM'];

function pad2(n) { return String(n).padStart(2, '0'); }

// "HH:MM" (24h) → friendly "hh:mm AM/PM". Exported for callers that render the
// chosen value elsewhere (e.g. a summary line).
export function to12h(hhmm) {
  if (!hhmm || typeof hhmm !== 'string' || !hhmm.includes(':')) return hhmm || '';
  const [hRaw, mRaw] = hhmm.split(':');
  let h = Number(hRaw);
  const m = Number(mRaw || 0);
  if (Number.isNaN(h)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = ((h + 11) % 12) + 1;
  return `${pad2(h12)}:${pad2(m)} ${period}`;
}

// "HH:MM" → {hourIdx (0-11), minIdx (0-59), periodIdx (0/1)}. Empty defaults to
// a round-ish current time so the wheels don't all start at 12:00 AM.
function toIndices(hhmm) {
  let h = 9; let m = 0; // sensible default
  if (hhmm && hhmm.includes(':')) {
    const [hr, mn] = hhmm.split(':');
    if (!Number.isNaN(Number(hr))) h = Number(hr);
    if (!Number.isNaN(Number(mn))) m = Number(mn);
  }
  const periodIdx = h >= 12 ? 1 : 0;
  const hour12 = ((h + 11) % 12) + 1;
  return { hourIdx: hour12 - 1, minIdx: m, periodIdx };
}

function fromIndices(hourIdx, minIdx, periodIdx) {
  const hour12 = hourIdx + 1;
  const base = hour12 % 12;                 // 12 → 0
  const h = periodIdx === 1 ? base + 12 : base; // PM adds 12; AM keeps (12AM→0)
  return `${pad2(h)}:${pad2(minIdx)}`;
}

// Clock-dial time picker in a bottom sheet (same look as the calendar sheet):
// hour / minute boxes + AM/PM toggle on top, tap a number on the dial.
function WheelModal({ visible, initial, onCancel, onSave, accent, title }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={pk.backdrop} onPress={onCancel}>
        <View style={pk.sheet} onStartShouldSetResponder={() => true}>
          {visible ? <ClockBody initial={initial} onCancel={onCancel} onSave={onSave} accent={accent} title={title} /> : null}
        </View>
      </Pressable>
    </Modal>
  );
}

function ClockBody({ initial, onCancel, onSave, accent, title }) {
  const tint = accent || '#035C6C';
  const start = toIndices(initial);
  const [hour, setHour] = useState(start.hourIdx + 1);      // 1..12
  const [minute, setMinute] = useState(start.minIdx);       // 0..59
  const [period, setPeriod] = useState(start.periodIdx);    // 0 AM, 1 PM
  const [stage, setStage] = useState('hour');
  const { width } = useWindowDimensions();
  const D = Math.min(width - 90, 290);
  const c = D / 2;
  const r = c - 30;
  const bubble = 44;
  const isHour = stage === 'hour';
  const marks = isHour ? Array.from({ length: 12 }, (_, i) => i + 1) : Array.from({ length: 12 }, (_, i) => i * 5);
  const value = isHour ? hour : minute;
  const angle = isHour ? (hour % 12) * 30 : minute * 6;
  const pos = (deg) => ({ left: c + r * Math.sin((deg * Math.PI) / 180) - bubble / 2, top: c - r * Math.cos((deg * Math.PI) / 180) - bubble / 2 });
  const pick = (v) => { if (isHour) { setHour(v); setStage('minute'); } else setMinute(v); };

  const box = (on) => [ck.box, { backgroundColor: on ? '#C3E2E7' : '#F1F3F2' }];
  return (
    <>
      <Text style={pk.label}>{title || 'Select time'}</Text>
      <View style={ck.topRow}>
        <Pressable style={box(isHour)} onPress={() => setStage('hour')}><Text style={[ck.boxText, isHour && { color: tint }]}>{pad2(hour)}</Text></Pressable>
        <Text style={ck.colon}>:</Text>
        <Pressable style={box(!isHour)} onPress={() => setStage('minute')}><Text style={[ck.boxText, !isHour && { color: tint }]}>{pad2(minute)}</Text></Pressable>
        <View style={ck.ampm}>
          {PERIODS.map((p, i) => (
            <Pressable key={p} onPress={() => setPeriod(i)} style={[ck.ampmCell, i === 0 && { borderBottomWidth: 1, borderBottomColor: '#9CA3AF' }, period === i && { backgroundColor: '#C3E2E7' }]}>
              <Text style={[ck.ampmText, period === i && { color: tint }]}>{p}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[ck.dial, { width: D, height: D, borderRadius: c }]}>
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { transform: [{ rotate: `${angle}deg` }] }]}>
          <View style={{ position: 'absolute', left: c - 1, top: c - r, width: 2, height: r, backgroundColor: tint }} />
        </View>
        <View pointerEvents="none" style={{ position: 'absolute', left: c - 5, top: c - 5, width: 10, height: 10, borderRadius: 5, backgroundColor: tint }} />
        {marks.includes(value) ? null : (
          <View pointerEvents="none" style={[ck.bubble, { width: bubble, height: bubble, borderRadius: bubble / 2, backgroundColor: tint }, pos(angle)]}>
            <Text style={[ck.mark, { color: '#FFFFFF', fontWeight: '700' }]}>{pad2(value)}</Text>
          </View>
        )}
        {marks.map((m) => {
          const on = m === value;
          const deg = isHour ? (m % 12) * 30 : m * 6;
          return (
            <Pressable key={m} onPress={() => pick(m)} style={[ck.bubble, { width: bubble, height: bubble, borderRadius: bubble / 2 }, on && { backgroundColor: tint }, pos(deg)]}>
              <Text style={[ck.mark, on && { color: '#FFFFFF', fontWeight: '700' }]}>{isHour ? m : pad2(m)}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={pk.actions}>
        <Pressable hitSlop={8} onPress={onCancel}><Text style={[pk.action, { color: tint }]}>Cancel</Text></Pressable>
        <Pressable hitSlop={8} onPress={() => onSave(fromIndices(hour - 1, minute, period))}><Text style={[pk.action, { color: tint }]}>OK</Text></Pressable>
      </View>
    </>
  );
}

const ck = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16, gap: 10 },
  box: { width: 96, height: 80, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  boxText: { fontSize: rf(44), fontWeight: '500', color: '#111111' },
  colon: { fontSize: rf(40), fontWeight: '700', color: '#111111' },
  ampm: { marginLeft: 6, borderWidth: 1, borderColor: '#9CA3AF', borderRadius: 10, overflow: 'hidden', width: 54 },
  ampmCell: { height: 40, alignItems: 'center', justifyContent: 'center' },
  ampmText: { fontSize: rf(15), fontWeight: '600', color: '#4B5563' },
  dial: { alignSelf: 'center', backgroundColor: '#EEF0EE', marginTop: 22 },
  bubble: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  mark: { fontSize: rf(16), color: '#111111' },
});

export default function TimePickerField({ value, placeholder = 'Select time', onChange, fieldStyle, accent }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable style={[styles.field, fieldStyle]} onPress={() => setOpen(true)}>
        <Ionicons name="time-outline" size={16} color="#6B7280" />
        <Text style={[styles.fieldText, { color: value ? '#111111' : '#9CA3AF' }]} numberOfLines={1}>
          {value ? to12h(value) : placeholder}
        </Text>
        {value ? (
          <Pressable hitSlop={8} onPress={() => onChange?.('')}>
            <Ionicons name="close-circle" size={16} color="#9CA3AF" />
          </Pressable>
        ) : (
          <Ionicons name="chevron-down" size={16} color="#9CA3AF" />
        )}
      </Pressable>
      <WheelModal
        visible={open}
        initial={value}
        onCancel={() => setOpen(false)}
        onSave={(v) => { onChange?.(v); setOpen(false); }}
        accent={accent}
      />
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#FFFFFF', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 12,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  fieldText: { flex: 1, fontSize: rf(13) },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 40 },
  sheet: { backgroundColor: '#FFFFFF', borderRadius: 18, paddingTop: 16, paddingBottom: 10, paddingHorizontal: 14 },
  sheetTitle: { fontSize: rf(13), fontWeight: '700', color: '#6B7280', textAlign: 'center', marginBottom: 8 },

  wheelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  centerBand: {
    position: 'absolute', left: 0, right: 0, top: PAD, height: ITEM_HEIGHT,
    backgroundColor: '#F3F4F6', borderRadius: 10,
  },
  colon: { fontSize: rf(22), fontWeight: '700', color: '#111111', marginHorizontal: 2 },

  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 12 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  cancelText: { fontSize: rf(14), fontWeight: '700', color: '#6B7280' },
  saveBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, backgroundColor: '#035C6C' },
  saveText: { fontSize: rf(14), fontWeight: '700', color: '#FFFFFF' },
});
