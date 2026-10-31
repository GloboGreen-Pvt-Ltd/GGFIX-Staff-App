import React from 'react';
import { ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Text } from './Typography';
import { rf, rs } from '../utils/responsive';

// Filter pills (design: My Tasks / Task History): the selected one solid
// teal, the rest light grey; scrolls sideways when they don't all fit.
//   tabs: [{ key, label, count? }]
export default function TaskTabs({ tabs, active, onPick }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.bar} contentContainerStyle={s.row}>
      {tabs.map((t) => {
        const on = active === t.key;
        return (
          <TouchableOpacity
            key={t.key}
            onPress={() => onPick(t.key)}
            activeOpacity={0.85}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[s.pill, on ? s.pillOn : null]}
          >
            <Text style={[s.text, on ? s.textOn : null]} numberOfLines={1}>
              {t.label}{t.count != null ? ` (${t.count})` : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  bar: { flexGrow: 0, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#EEF0F2' },
  row: { gap: rs(8), paddingHorizontal: rs(12), paddingVertical: rs(9) },
  pill: { borderRadius: 999, backgroundColor: '#F3F4F6', paddingHorizontal: rs(16), paddingVertical: rs(7), minHeight: rs(32), justifyContent: 'center' },
  pillOn: { backgroundColor: '#035C6C' },
  text: { fontSize: rf(12.5), fontWeight: '700', color: '#1C3053' },
  textOn: { color: '#FFFFFF' },
});
