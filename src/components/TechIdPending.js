import React from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { CircleAlert, RefreshCw } from 'lucide-react-native';
import { rf, rs } from '../utils/responsive';
import { isShopOwnerSession } from '../utils/profileDebug';

// Shown by attendance screens while the technician id is being resolved:
// a spinner while loading, or a short message + Retry if the lookup failed
// (instead of spinning forever).
export default function TechIdPending({ failed, onRetry }) {
  if (!failed) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color="#09AD2A" />
      </View>
    );
  }
  const owner = isShopOwnerSession();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: rs(32) }}>
      <View style={{ width: rs(52), height: rs(52), borderRadius: rs(26), backgroundColor: '#FEECEC', alignItems: 'center', justifyContent: 'center' }}>
        <CircleAlert size={rs(26)} color="#F84141" />
      </View>
      <Text style={{ fontSize: rf(16), fontWeight: '800', color: '#1E1E1E', marginTop: rs(12), textAlign: 'center' }}>
        {owner ? "This is the shop owner's login" : "Couldn't load your attendance profile"}
      </Text>
      <Text style={{ fontSize: rf(13), color: '#6E6E6E', marginTop: rs(6), textAlign: 'center' }}>
        {owner
          ? "Owner accounts don't have attendance. Sign in with the employee's mobile number, or add yourself as an employee in the GGFIX Partner app."
          : 'Check your connection and try again. If it keeps happening, ask your shop admin to check your employee profile.'}
      </Text>
      <TouchableOpacity
        onPress={onRetry}
        activeOpacity={0.85}
        style={{ marginTop: rs(16), flexDirection: 'row', alignItems: 'center', backgroundColor: '#09AD2A', borderRadius: 999, paddingHorizontal: rs(22), height: rs(42) }}
      >
        <RefreshCw size={rs(16)} color="#FFFFFF" strokeWidth={2.4} />
        <Text style={{ fontSize: rf(14), fontWeight: '700', color: '#FFFFFF', marginLeft: rs(8) }}>Retry</Text>
      </TouchableOpacity>
    </View>
  );
}
