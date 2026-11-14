import React from 'react';
import { ActivityIndicator, Pressable, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { Text } from '../../components/Typography';
import { isSafeText, userMessage } from '../../utils/userMessages';
import { rf, rs } from '../../utils/responsive';

// Buy-delivery screens' look — same Employee App teal cards / buttons as the
// sell inspection pages, kept here so these screens stand on their own.
export const SK = {
  teal: '#035C6C',
  tealSoft: '#E5F3F5',
  ink: '#111111',
  page: '#F3F4F6',
  line: '#E5E7EB',
  disabled: '#9DC2C9',
};
export const SC = { green: '#609138', red: '#F32C26', redSoft: '#FDECEB' };

const cardShadow = { shadowColor: '#111111', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 };

export const money = (v) => (v == null || v === '' || Number.isNaN(Number(v)) ? '—' : `₹${Number(v).toLocaleString('en-IN')}`);
/** The server's own sentence when it is safe to show (OTP / amount rules), else the app's. */
export const apiError = (e, fallback) => (isSafeText(e?.payload?.message) ? e.payload.message : userMessage(e, fallback));

export function Page({ title, subtitle, navigation, children }) {
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: SK.page }}>
      <View style={{ backgroundColor: '#FFFFFF', paddingHorizontal: rs(16), paddingVertical: rs(10), borderBottomWidth: 1, borderBottomColor: '#D5E8EC' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#EEF6F8', borderWidth: 1, borderColor: '#C7E6EA', alignItems: 'center', justifyContent: 'center' }}
          >
            <ChevronLeft size={20} color={SK.ink} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center', marginHorizontal: 8 }}>
            <Text style={{ fontSize: rf(17), fontWeight: '800', color: SK.ink }} numberOfLines={1}>{title}</Text>
            {subtitle ? <Text style={{ fontSize: rf(12), color: '#3F5B7A', marginTop: 2 }} numberOfLines={1}>{subtitle}</Text> : null}
          </View>
          <View style={{ width: 34 }} />
        </View>
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </SafeAreaView>
  );
}

export function Card({ title, children, style }) {
  return (
    <View style={[{ backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: SK.line, padding: 10, marginTop: 8, ...cardShadow }, style]}>
      {title ? <Text style={{ fontSize: rf(14), fontWeight: '800', color: SK.ink, marginBottom: 6 }}>{title}</Text> : null}
      {children}
    </View>
  );
}

export function Button({ title, Icon, onPress, disabled, loading, variant = 'primary', style }) {
  const off = disabled || loading;
  const filled = variant === 'primary' || variant === 'success';
  const tone = variant === 'success' ? SC.green : variant === 'danger' ? SC.red : SK.teal;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={[{
        minHeight: 40, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14,
        backgroundColor: filled ? (off ? SK.disabled : tone) : (variant === 'danger' ? SC.redSoft : '#FFFFFF'),
        borderWidth: filled ? 0 : 1.5, borderColor: tone, opacity: !filled && off ? 0.5 : 1,
      }, style]}
    >
      {loading ? <ActivityIndicator color={filled ? '#FFFFFF' : tone} /> : (
        <>
          {Icon ? <Icon size={16} color={filled ? '#FFFFFF' : tone} strokeWidth={2.4} /> : null}
          <Text style={{ marginLeft: Icon ? 6 : 0, fontSize: rf(13), fontWeight: '800', color: filled ? '#FFFFFF' : tone }} numberOfLines={2}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Loader() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={SK.teal} />
    </View>
  );
}
