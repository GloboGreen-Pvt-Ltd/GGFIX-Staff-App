import React, { useEffect, useRef, useState } from 'react';
import { View, TouchableOpacity, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { Check, ChevronDown, Pause, Play, Search, X } from 'lucide-react-native';
import { Text, TextInput } from './Typography';
import { DevicePhoto } from './JobCardKit';
import { Audio } from '../utils/audio';
import { rf, sheetWidth } from '../utils/responsive';

// Shared look for the Solution Packs screens: white canvas, #035C6C teal,
// compact rounded cards.
export const SC = {
  green: '#035C6C', tint: '#E6F2F4', ink: '#111827', muted: '#6B7280', faint: '#9CA3AF',
  border: '#E5E7EB', soft: '#F5F7F8', bg: '#FFFFFF', red: '#F32C26',
  ok: '#15803D', okTint: '#DCFCE7', warn: '#B45309', warnTint: '#FEF3C7',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function fmtWhen(ts) {
  const d = new Date(ts);
  if (!ts || Number.isNaN(d.getTime())) return '';
  const h = d.getHours();
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}, ${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

export function Card({ children, style, onPress, onLongPress }) {
  const body = { backgroundColor: SC.bg, borderRadius: 14, borderWidth: 1, borderColor: SC.border, padding: 12, marginBottom: 10, ...style };
  if (!onPress && !onLongPress) return <View style={body}>{children}</View>;
  return <TouchableOpacity activeOpacity={0.85} onPress={onPress} onLongPress={onLongPress} style={body}>{children}</TouchableOpacity>;
}

const TONES = {
  ok: [SC.okTint, SC.ok], warn: [SC.warnTint, SC.warn], muted: ['#F3F4F6', '#4B5563'], teal: [SC.tint, SC.green], red: ['#FEE2E2', '#B91C1C'],
};
export function Badge({ label, tone = 'teal' }) {
  const [bg, fg] = TONES[tone] || TONES.teal;
  return (
    <View style={{ backgroundColor: bg, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' }}>
      <Text style={{ fontSize: rf(10.5), fontWeight: '700', color: fg }}>{label}</Text>
    </View>
  );
}

export function SectionTitle({ children, style }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, ...style }}>
      <View style={{ width: 3, height: 16, borderRadius: 2, backgroundColor: SC.green, marginRight: 7 }} />
      <Text style={{ fontSize: rf(15), fontWeight: '800', color: SC.green }}>{children}</Text>
    </View>
  );
}

export function Label({ children, required, optional }) {
  return (
    <Text style={{ fontSize: rf(12), color: SC.green, fontWeight: '600', marginBottom: 5, marginTop: 10 }}>
      {children}
      {required ? <Text style={{ color: SC.red }}> *</Text> : null}
      {optional ? <Text style={{ color: SC.muted, fontWeight: '400' }}> (Optional)</Text> : null}
    </Text>
  );
}

export function Select({ value, placeholder, onPress, disabled, compact }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={{
        flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: SC.border, backgroundColor: SC.bg,
        borderRadius: compact ? 18 : 10, paddingHorizontal: compact ? 12 : 11, paddingVertical: compact ? 6 : 10, opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text style={{ flexShrink: 1, fontSize: rf(compact ? 12 : 13), color: value ? SC.ink : SC.faint, fontWeight: compact ? '600' : '400' }} numberOfLines={1}>
        {value || placeholder}
      </Text>
      <View style={{ flex: compact ? 0 : 1 }} />
      <ChevronDown size={15} color={SC.ink} style={{ marginLeft: 6 }} />
    </TouchableOpacity>
  );
}

export function Input({ multiline, style, ...rest }) {
  return (
    <TextInput
      placeholderTextColor={SC.faint}
      multiline={multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      style={{
        borderWidth: 1, borderColor: SC.border, borderRadius: 10, backgroundColor: SC.bg, paddingHorizontal: 11,
        paddingVertical: 9, fontSize: rf(13), color: SC.ink, minHeight: multiline ? 68 : undefined, ...style,
      }}
      {...rest}
    />
  );
}

export function Btn({ label, onPress, outline, loading, disabled, style }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      style={{
        flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
        backgroundColor: outline ? SC.bg : SC.green, borderWidth: 1.5, borderColor: SC.green, opacity: disabled ? 0.55 : 1, ...style,
      }}
    >
      {loading ? <ActivityIndicator color={outline ? SC.green : '#FFFFFF'} />
        : <Text style={{ fontSize: rf(14), fontWeight: '800', color: outline ? SC.green : '#FFFFFF' }}>{label}</Text>}
    </TouchableOpacity>
  );
}

// 1 Details — 2 Steps — 3 Review. Done steps show a tick; tapping one jumps there.
export function Stepper({ step, onPick }) {
  const items = ['Details', 'Steps', 'Review'];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 }}>
      {items.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const cur = n === step;
        return (
          <React.Fragment key={label}>
            <TouchableOpacity disabled={!onPick} onPress={() => onPick?.(n)} style={{ alignItems: 'center', width: 64 }}>
              <View
                style={{
                  width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: done || cur ? SC.green : SC.bg, borderWidth: 1.5, borderColor: done || cur ? SC.green : SC.faint,
                }}
              >
                {done ? <Check size={14} color="#FFFFFF" strokeWidth={3} />
                  : <Text style={{ fontSize: rf(12), fontWeight: '800', color: cur ? '#FFFFFF' : SC.muted }}>{n}</Text>}
              </View>
              <Text style={{ fontSize: rf(11), color: cur ? SC.ink : SC.muted, marginTop: 4, fontWeight: cur ? '700' : '400' }}>{label}</Text>
            </TouchableOpacity>
            {i < items.length - 1 ? <View style={{ flex: 1, height: 1.5, backgroundColor: done ? SC.green : SC.border, marginTop: 12 }} /> : null}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// Device picture from the catalogue (same lookup as the job cards).
export function DeviceThumb({ brand, model, size = 50 }) {
  return (
    <View style={{ width: size, height: size * 1.15 }}>
      <DevicePhoto ticket={{ id: `${brand?.id || brand?.name || ''}:${model?.id || model?.name || ''}`, brandId: brand?.id, modelId: model?.id, brandName: brand?.name, modelName: model?.name }} />
    </View>
  );
}

export function statusMeta(rec) {
  if (rec?.status === 'published') return { label: 'Published', tone: 'ok', where: 'Server saved' };
  if (rec?.status === 'saved') return { label: 'Saved', tone: 'warn', where: 'Local only' };
  return { label: 'Draft', tone: 'muted', where: 'Local only' };
}

// Bottom sheet list with an optional search box.
export function PickerSheet({ visible, title, options, onPick, onClose }) {
  const [q, setQ] = useState('');
  useEffect(() => { if (!visible) setQ(''); }, [visible]);
  const shown = q ? options.filter((o) => String(o.label).toLowerCase().includes(q.toLowerCase())) : options;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}>
        <View style={[{ backgroundColor: SC.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 14, maxHeight: '75%' }, sheetWidth]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Text style={{ flex: 1, fontSize: rf(16), fontWeight: '800', color: SC.ink }}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}><X size={18} color={SC.ink} /></TouchableOpacity>
          </View>
          {options.length > 8 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: SC.soft, borderRadius: 10, paddingHorizontal: 10, marginBottom: 8 }}>
              <Search size={15} color={SC.muted} />
              <TextInput value={q} onChangeText={setQ} placeholder="Search" placeholderTextColor={SC.faint} style={{ flex: 1, paddingVertical: 8, marginLeft: 6, fontSize: rf(13), color: SC.ink }} />
            </View>
          ) : null}
          {shown.length === 0 ? (
            <Text style={{ textAlign: 'center', color: SC.muted, paddingVertical: 24, fontSize: rf(12) }}>No options available</Text>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              {shown.map((o) => (
                <TouchableOpacity key={String(o.key)} onPress={() => onPick(o)} style={{ paddingVertical: 12, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
                  <Text style={{ fontSize: rf(13), color: SC.ink }}>{o.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

// In-app voice note playback (hosted URL or a file on this phone).
export function AudioRow({ uri, label = 'Voice note', onRemove, right }) {
  const ref = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => { ref.current?.unloadAsync?.(); }, []);
  const toggle = async () => {
    if (busy) return;
    try {
      if (!ref.current) {
        setBusy(true);
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: false });
        const { sound } = await Audio.Sound.createAsync({ uri });
        sound.setOnPlaybackStatusUpdate((st) => { if (st.didJustFinish) { setPlaying(false); sound.setPositionAsync(0); } });
        ref.current = sound;
      }
      if (playing) { await ref.current.pauseAsync(); setPlaying(false); } else { await ref.current.playAsync(); setPlaying(true); }
    } catch { setPlaying(false); } finally { setBusy(false); }
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: SC.soft, borderRadius: 10, padding: 8, marginTop: 8 }}>
      <TouchableOpacity onPress={toggle} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: SC.green, alignItems: 'center', justifyContent: 'center' }}>
        {busy ? <ActivityIndicator size="small" color="#FFFFFF" /> : playing ? <Pause size={15} color="#FFFFFF" /> : <Play size={15} color="#FFFFFF" />}
      </TouchableOpacity>
      <Text style={{ flex: 1, marginLeft: 10, fontSize: rf(12.5), color: SC.ink }} numberOfLines={1}>{label}</Text>
      {right}
      {onRemove ? <TouchableOpacity onPress={onRemove} hitSlop={8}><X size={16} color={SC.muted} /></TouchableOpacity> : null}
    </View>
  );
}
