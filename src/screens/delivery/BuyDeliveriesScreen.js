import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MapPin, Package, Store, Truck } from 'lucide-react-native';
import { DELIVERY_STATUS, DELIVERY_TABS, listMyDeliveries } from '../../api/buyDeliveries';
import { Card, Page, SC, SK, apiError, money } from './deliveryKit';

// My Assignments — fixed-price Buy orders this employee picks up from the shop
// and delivers. Counts come from the server list; only own orders are returned.
export default function BuyDeliveriesScreen({ navigation }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('NEW');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setRows(await listMyDeliveries()); setError(''); }
    catch (e) { setError(apiError(e, 'Could not load your assignments.')); }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const counts = useMemo(() => Object.fromEntries(DELIVERY_TABS.map((t) => [t.key, (rows || []).filter((o) => t.statuses.includes(o.status)).length])), [rows]);
  const shown = (rows || []).filter((o) => DELIVERY_TABS.find((t) => t.key === tab).statuses.includes(o.status));

  return (
    <Page title="My Deliveries" subtitle="Shop pickup → customer delivery" navigation={navigation}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
          {DELIVERY_TABS.map((t) => {
            const on = t.key === tab;
            return (
              <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: on }}
                style={{ flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center', backgroundColor: on ? SK.teal : SK.tealSoft }}>
                <Text style={{ fontSize: 12.5, fontWeight: '700', color: on ? '#FFFFFF' : SK.teal }}>{t.label} ({counts[t.key] || 0})</Text>
              </Pressable>
            );
          })}
        </View>

        {rows === null && !error ? <ActivityIndicator color={SK.teal} style={{ marginTop: 40 }} /> : null}
        {error ? (
          <Card>
            <Text style={{ color: SC.red, fontSize: 13 }}>{error}</Text>
            <Pressable onPress={load} style={{ marginTop: 8 }} accessibilityRole="button"><Text style={{ color: SK.teal, fontWeight: '700' }}>Retry</Text></Pressable>
          </Card>
        ) : null}
        {rows && !error && !shown.length ? (
          <Card>
            <View style={{ alignItems: 'center', paddingVertical: 18 }}>
              <Package size={28} color={SK.teal} />
              <Text style={{ marginTop: 8, color: '#606E87', fontSize: 13 }}>No {tab === 'HISTORY' ? 'past' : tab === 'NEW' ? 'new' : 'active'} deliveries.</Text>
            </View>
          </Card>
        ) : null}

        {shown.map((o) => (
          <Pressable key={o.id} onPress={() => navigation.navigate('BuyDelivery', { id: o.id })} accessibilityRole="button">
            <Card>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ width: 54, height: 54, borderRadius: 12, backgroundColor: SK.tealSoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  {o.productImage ? <Image source={{ uri: o.productImage }} style={{ width: '100%', height: '100%' }} resizeMode="contain" /> : <Package size={22} color={SK.teal} />}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 12, color: '#606E87' }}>{o.orderNumber}</Text>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: o.status === 'DELIVERY_FAILED' ? SC.red : SK.teal }}>{DELIVERY_STATUS[o.status] || o.status}</Text>
                  </View>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: SK.ink }} numberOfLines={1}>{o.productTitle || 'Product'}{o.quantity > 1 ? ` × ${o.quantity}` : ''}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: SK.teal, marginTop: 2 }}>COD {money(o.totalAmount)}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    {o.status === 'ASSIGNED' || o.status === 'ACCEPTED' ? <Store size={13} color="#606E87" /> : o.status === 'OUT_FOR_DELIVERY' ? <Truck size={13} color="#606E87" /> : <MapPin size={13} color="#606E87" />}
                    <Text style={{ fontSize: 12, color: '#606E87', flex: 1 }} numberOfLines={1}>{o.deliveryAddress || '—'}</Text>
                  </View>
                </View>
              </View>
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    </Page>
  );
}
