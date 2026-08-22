import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

function WheelColumn({ data, initialIndex, onSettle, width }) {
  const ref = useRef(null);
  const [active, setActive] = useState(initialIndex);

  // Land on the initial row when the wheel mounts (no animation).
  const onLayout = () => {
    ref.current?.scrollTo({ y: initialIndex * ITEM_HEIGHT, animated: false });
  };

  const idxFromOffset = (y) => Math.max(0, Math.min(data.length - 1, Math.round(y / ITEM_HEIGHT)));

  const onScroll = (e) => {
    const i = idxFromOffset(e.nativeEvent.contentOffset.y);
    if (i !== active) setActive(i);
  };
  const onEnd = (e) => {
    const i = idxFromOffset(e.nativeEvent.contentOffset.y);
    setActive(i);
    onSettle(i);
  };

  return (
    <ScrollView
      ref={ref}
      onLayout={onLayout}
      style={{ width, height: ITEM_HEIGHT * VISIBLE }}
      contentContainerStyle={{ paddingVertical: PAD }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_HEIGHT}
      snapToAlignment="start"
      decelerationRate="fast"
      scrollEventThrottle={16}
      nestedScrollEnabled
      onScroll={onScroll}
      onMomentumScrollEnd={onEnd}
      onScrollEndDrag={onEnd}
    >
      {data.map((d, i) => (
        <View key={d} style={{ height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontSize: rf(22), fontWeight: i === active ? '700' : '400', color: i === active ? '#111827' : '#C7CCD6' }}>
            {d}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

function WheelModal({ visible, initial, onCancel, onSave }) {
  const start = toIndices(initial);
  // Live selection kept in refs so column scrolling doesn't re-render the modal.
  const hourIdx = useRef(start.hourIdx);
  const minIdx = useRef(start.minIdx);
  const periodIdx = useRef(start.periodIdx);

  // Re-seed the refs from `initial` every time the modal opens. The modal never
  // unmounts (only `visible` toggles), so without this a Save tapped without
  // scrolling would commit a stale value left over from a previous open.
  useEffect(() => {
    if (!visible) return;
    const s = toIndices(initial);
    hourIdx.current = s.hourIdx;
    minIdx.current = s.minIdx;
    periodIdx.current = s.periodIdx;
  }, [visible, initial]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.sheetTitle}>Select time</Text>

          <View style={styles.wheelRow}>
            {/* Centre highlight band behind the three columns */}
            <View pointerEvents="none" style={styles.centerBand} />
            {visible ? (
              <>
                <WheelColumn data={HOURS} initialIndex={start.hourIdx} width={56} onSettle={(i) => { hourIdx.current = i; }} />
                <Text style={styles.colon}>:</Text>
                <WheelColumn data={MINUTES} initialIndex={start.minIdx} width={56} onSettle={(i) => { minIdx.current = i; }} />
                <WheelColumn data={PERIODS} initialIndex={start.periodIdx} width={56} onSettle={(i) => { periodIdx.current = i; }} />
              </>
            ) : null}
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} onPress={onCancel} hitSlop={8}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={styles.saveBtn}
              hitSlop={8}
              onPress={() => onSave(fromIndices(hourIdx.current, minIdx.current, periodIdx.current))}
            >
              <Text style={styles.saveText}>Save</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function TimePickerField({ value, placeholder = 'Select time', onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable style={styles.field} onPress={() => setOpen(true)}>
        <Ionicons name="time-outline" size={16} color="#6B7280" />
        <Text style={[styles.fieldText, { color: value ? '#111827' : '#9CA3AF' }]} numberOfLines={1}>
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
    backgroundColor: '#F1F5F9', borderRadius: 10,
  },
  colon: { fontSize: rf(22), fontWeight: '700', color: '#111827', marginHorizontal: 2 },

  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, marginTop: 12 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  cancelText: { fontSize: rf(14), fontWeight: '700', color: '#6B7280' },
  saveBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, backgroundColor: '#00008B' },
  saveText: { fontSize: rf(14), fontWeight: '700', color: '#FFFFFF' },
});
