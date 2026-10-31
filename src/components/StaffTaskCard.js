import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { MapPin, ChevronRight } from 'lucide-react-native';
import { Text } from './Typography';
import { rf, rs } from '../utils/responsive';
import { categoryMeta, displayStatus, relDay, timeRange } from '../utils/staffTasks';
import { GradientFill, toneOf } from './JobCardKit';

// One staff task in a list (design: My Tasks / Task History): category circle,
// title with its status badge, "Today • 15:00 – 16:00" behind a status dot,
// the location, and a chevron. `badge` overrides the status badge (History).
export default function StaffTaskCard({ task, onPress, badge }) {
  const cat = categoryMeta(task.category);
  const st = badge || displayStatus(task);
  const CatIcon = cat.icon;
  const tone = toneOf(cat.color, 0.12);
  const place = task.locationName || task.locationAddress;
  const when = [relDay(task.startAt), timeRange(task)].filter(Boolean).join(' • ');
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={s.card} accessibilityRole="button" accessibilityLabel={`${task.title}, ${st.label}`}>
      {/* App icon style (My Jobs rail): light gradient tile, solid circle, white icon. */}
      <View style={[s.iconTile, { borderColor: tone.edge }]}>
        <GradientFill tone={tone} radius={rs(12)} />
        <View style={[s.catCircle, { backgroundColor: cat.color }]}>
          <CatIcon size={rs(15)} color="#FFFFFF" strokeWidth={2.3} />
        </View>
      </View>
      <View style={s.body}>
        <View style={s.topRow}>
          <Text style={s.title} numberOfLines={1}>{task.title}</Text>
          <View style={[s.badge, { backgroundColor: st.bg }]}>
            <Text style={[s.badgeText, { color: st.color }]} numberOfLines={1}>{st.label}</Text>
          </View>
        </View>
        {when ? (
          <View style={s.metaRow}>
            <View style={[s.dot, { backgroundColor: st.color }]} />
            <Text style={s.meta} numberOfLines={1}>{when}</Text>
          </View>
        ) : null}
        {place ? (
          <View style={s.metaRow}>
            <MapPin size={rs(12)} color="#6B7280" />
            <Text style={[s.meta, { flex: 1 }]} numberOfLines={1}>{place}</Text>
          </View>
        ) : null}
      </View>
      <ChevronRight size={rs(16)} color="#6B7280" />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: rs(10), backgroundColor: '#FFFFFF', borderRadius: rs(14),
    borderWidth: 1, borderColor: '#EEF0F2', paddingVertical: rs(10), paddingHorizontal: rs(10), marginBottom: rs(8),
    shadowColor: '#111111', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1,
  },
  iconTile: { width: rs(44), height: rs(44), borderRadius: rs(12), borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  catCircle: { width: rs(32), height: rs(32), borderRadius: rs(16), alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: rs(6) },
  title: { flex: 1, fontSize: rf(13.5), fontWeight: '800', color: '#111111' },
  badge: { borderRadius: rs(6), paddingHorizontal: rs(7), paddingVertical: rs(2) },
  badgeText: { fontSize: rf(10.5), fontWeight: '700' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: rs(5), marginTop: rs(4) },
  dot: { width: rs(7), height: rs(7), borderRadius: rs(4) },
  meta: { fontSize: rf(11.5), color: '#6B7280' },
});
