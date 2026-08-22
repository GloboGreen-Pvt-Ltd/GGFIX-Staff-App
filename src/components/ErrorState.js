import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { rf } from '../utils/responsive';

/**
 * Shared load-failure card with a Retry action. Report/list screens previously
 * swallowed fetch errors into their empty state ("No data"), which made a
 * network/500 failure indistinguishable from a genuinely empty list. Render
 * this INSTEAD of the empty state when the load actually failed:
 *
 *   {error ? <ErrorState message={error} onRetry={() => load()} />
 *          : items.length === 0 ? <Empty ... /> : ...}
 *
 * Self-contained (plain RN styles + rf()) so it drops into both StyleSheet and
 * NativeWind screens without pulling either styling system in.
 */
export default function ErrorState({ message, onRetry }) {
  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Ionicons name="cloud-offline-outline" size={rf(22)} color="#DC2626" />
      </View>
      <Text style={styles.title}>Couldn't load data</Text>
      <Text style={styles.message} numberOfLines={3}>
        {message || 'Something went wrong. Check your connection and try again.'}
      </Text>
      {onRetry ? (
        <Pressable onPress={onRetry} style={styles.retryBtn} hitSlop={6}>
          <Ionicons name="refresh" size={rf(14)} color="#FFFFFF" />
          <Text style={styles.retryText}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#FEE2E2',
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  title: { fontSize: rf(14), fontWeight: '800', color: '#111827' },
  message: { fontSize: rf(12), color: '#6B7280', textAlign: 'center', marginTop: 4, lineHeight: rf(17) },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14,
    backgroundColor: '#DC2626', borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9,
  },
  retryText: { color: '#FFFFFF', fontSize: rf(13), fontWeight: '800' },
});
