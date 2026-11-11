import React, { useCallback, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { CalendarClock, MapPin, Wrench } from 'lucide-react-native';
import { REPAIR_DELIVERY_TABS, listRepairDeliveries } from '../../api/repairDeliveries';
import { rf, rs } from '../../utils/responsive';
import { Card, Loader, Page, SC, SK, apiError, money } from './deliveryKit';

// My Deliveries (repairs): repaired devices to take from the shop back to the
// customer. Server state only; refreshed on focus and every 20 s.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function slotText(d) {
  if (!d?.scheduledDate) return '—';
  const [, m, day] = d.scheduledDate.split('-').map(Number);
  const h = (t) => { const n = Number(String(t || '').slice(0, 2)); return `${n % 12 || 12} ${n < 12 ? 'AM' : 'PM'}`; };
  return `${day} ${MONTHS[m - 1]}, ${h(d.slotStart)} – ${h(d.slotEnd)}`;
}
export const statusTone = (s) => (s === 'DELIVERED' ? SC.green : ['FAILED', 'RETURNING', 'UNASSIGNED'].includes(s) ? '#B45309' : SK.teal);

export default function RepairDeliveriesScreen({ navigation }) {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('ACTIVE');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await listRepairDeliveries();
      setList(Array.isArray(data) ? data : []);
      setError(null);
    } catch (e) {
      setError(apiError(e, 'Could not load deliveries.'));
      setList((l) => l || []);
    }
  }, []);
  useFocusEffect(useCallback(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const statuses = REPAIR_DELIVERY_TABS.find((t) => t.key === tab).statuses;
  const shown = (list || []).filter((d) => statuses.includes(d.status));

  return (
    <Page title="Repair Deliveries" subtitle="Shop → Customer" navigation={navigation}>
      {list == null ? <Loader /> : (
        <ScrollView contentContainerStyle={{ padding: rs(14), paddingBottom: rs(30) }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[SK.teal]} />}>
          <View style={{ flexDirection: 'row', gap: rs(8) }}>
            {REPAIR_DELIVERY_TABS.map((t) => {
              const on = t.key === tab;
              const n = (list || []).filter((d) => t.statuses.includes(d.status)).length;
              return (
                <Pressable key={t.key} onPress={() => setTab(t.key)} accessibilityRole="tab" accessibilityState={{ selected: on }}
                  style={{ flex: 1, height: rs(40), borderRadius: rs(20), alignItems: 'center', justifyContent: 'center', backgroundColor: on ? SK.teal : '#FFFFFF', borderWidth: 1, borderColor: on ? SK.teal : SK.line }}>
                  <Text style={{ fontSize: rf(14), fontWeight: '800', color: on ? '#FFFFFF' : SK.ink }}>{`${t.label} (${n})`}</Text>
                </Pressable>
              );
            })}
          </View>
          {error ? <Text style={{ color: SC.red, fontSize: rf(13), marginTop: rs(10) }}>{error}</Text> : null}
          {!shown.length ? (
            <Card style={{ alignItems: 'center', paddingVertical: rs(24) }}>
              <Wrench size={28} color={SK.teal} />
              <Text style={{ fontSize: rf(15), fontWeight: '800', color: SK.ink, marginTop: rs(8) }}>{tab === 'ACTIVE' ? 'No deliveries right now' : 'No past deliveries'}</Text>
              <Text style={{ fontSize: rf(13), color: '#6B7280', marginTop: rs(4), textAlign: 'center' }}>Repaired devices the shop assigns to you appear here.</Text>
            </Card>
          ) : shown.map((d) => (
            <Pressable key={d.id} onPress={() => navigation.navigate('RepairDelivery', { id: d.id })} accessibilityRole="button" accessibilityLabel={`Delivery ${d.bookingNumber || ''}`}>
              <Card>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {d.deviceImageUrl ? <Image source={{ uri: d.deviceImageUrl }} style={{ width: rs(48), height: rs(48), borderRadius: rs(10), backgroundColor: SK.page }} /> : (
                    <View style={{ width: rs(48), height: rs(48), borderRadius: rs(10), backgroundColor: SK.tealSoft, alignItems: 'center', justifyContent: 'center' }}><Wrench size={22} color={SK.teal} /></View>
                  )}
                  <View style={{ flex: 1, marginLeft: rs(10) }}>
                    <Text style={{ fontSize: rf(15), fontWeight: '800', color: SK.ink }} numberOfLines={1}>{d.device}</Text>
                    <Text style={{ fontSize: rf(12.5), color: '#6B7280' }}>{`#${d.bookingNumber || '—'} · Attempt ${d.attempt}`}</Text>
                  </View>
                  <View style={{ borderRadius: rs(12), paddingHorizontal: rs(10), paddingVertical: rs(4), backgroundColor: `${statusTone(d.status)}1A` }}>
                    <Text style={{ fontSize: rf(12), fontWeight: '800', color: statusTone(d.status) }}>{d.statusLabel}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: rs(10) }}>
                  <CalendarClock size={15} color={SK.teal} />
                  <Text style={{ fontSize: rf(13), color: SK.ink, marginLeft: rs(6), flex: 1 }}>{slotText(d)}</Text>
                  {Number(d.amountDue) > 0 && d.status !== 'DELIVERED' ? <Text style={{ fontSize: rf(13), fontWeight: '800', color: SK.ink }}>{`Collect ${money(d.amountDue)}`}</Text> : null}
                </View>
                {d.customerAddress ? (
                  <View style={{ flexDirection: 'row', marginTop: rs(6) }}>
                    <MapPin size={15} color="#6B7280" />
                    <Text style={{ fontSize: rf(12.5), color: '#6B7280', marginLeft: rs(6), flex: 1 }} numberOfLines={2}>{d.customerAddress}</Text>
                  </View>
                ) : null}
              </Card>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Page>
  );
}
