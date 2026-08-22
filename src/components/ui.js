/**
 * Legacy UI primitives kept around so older screens that import from
 * `../components/ui` keep compiling. New screens should reach for the
 * NativeWind primitives in `./rnr/` instead.
 */
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput as RNInput, TouchableOpacity, View } from 'react-native';
import colors from '../theme/colors';
import { rf } from '../utils/responsive';

const styles = StyleSheet.create({
  // Compact, marketplace-style primitives. Anything still importing from
  // `components/ui` automatically inherits these tighter defaults.
  pillBtn: { paddingVertical: 11, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  primary: { backgroundColor: colors.primary },
  primaryText: { color: '#fff', fontSize: rf(14), fontWeight: '700' },
  outline: { borderWidth: 1, borderColor: colors.primary, backgroundColor: '#fff' },
  outlineText: { color: colors.primary, fontSize: rf(13), fontWeight: '700' },
  danger: { borderWidth: 1, borderColor: colors.danger, backgroundColor: '#fff' },
  dangerText: { color: colors.danger, fontSize: rf(13), fontWeight: '700' },

  card: { backgroundColor: '#fff', borderRadius: 14, padding: 12, marginVertical: 5, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: rf(14), fontWeight: '800', color: colors.text, marginBottom: 4 },
  cardSubtitle: { fontSize: rf(12), color: colors.textMuted },

  input: { backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: rf(13), color: colors.text },
  label: { fontSize: rf(11), color: colors.textMuted, marginBottom: 4, marginTop: 8 },

  section: { padding: 12 },
  sectionTitle: { fontSize: rf(15), fontWeight: '800', color: colors.text, marginBottom: 8 },

  empty: { padding: 24, alignItems: 'center' },
  emptyText: { fontSize: rf(13), color: colors.textMuted, textAlign: 'center' },

  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },

  row: { flexDirection: 'row', alignItems: 'center' },

  chip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.border, marginRight: 6, marginBottom: 6 },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontSize: rf(12) },
  chipTextActive: { color: '#fff', fontWeight: '700' },

  tile: { flex: 1, margin: 4, padding: 12, backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: colors.border, alignItems: 'center', minHeight: 96 },
  tileText: { fontSize: rf(12), fontWeight: '700', color: colors.text, marginTop: 6, textAlign: 'center' },
});

export function PrimaryButton({ title, onPress, loading, disabled, style }) {
  return (
    <TouchableOpacity style={[styles.pillBtn, styles.primary, (disabled || loading) && { opacity: 0.6 }, style]} onPress={onPress} disabled={disabled || loading}>
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{title}</Text>}
    </TouchableOpacity>
  );
}

export function OutlineButton({ title, onPress, style }) {
  return (
    <TouchableOpacity style={[styles.pillBtn, styles.outline, style]} onPress={onPress}>
      <Text style={styles.outlineText}>{title}</Text>
    </TouchableOpacity>
  );
}

export function DangerButton({ title, onPress, style }) {
  return (
    <TouchableOpacity style={[styles.pillBtn, styles.danger, style]} onPress={onPress}>
      <Text style={styles.dangerText}>{title}</Text>
    </TouchableOpacity>
  );
}

export function Card({ children, style }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Section({ title, children, style }) {
  return (
    <View style={[styles.section, style]}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function Empty({ text = 'Nothing here yet' }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function Loader() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

export function LabeledInput({ label, ...rest }) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <RNInput style={styles.input} placeholderTextColor={colors.textMuted} {...rest} />
    </View>
  );
}

export function Chip({ label, active, onPress }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Tile({ label, onPress, selected, children, style }) {
  return (
    <TouchableOpacity style={[styles.tile, selected && { borderColor: colors.primary, borderWidth: 2 }, style]} onPress={onPress}>
      {children}
      {label ? <Text style={styles.tileText}>{label}</Text> : null}
    </TouchableOpacity>
  );
}

export { styles as uiStyles };
