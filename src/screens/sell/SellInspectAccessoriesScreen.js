import React, { useRef, useState } from 'react';
import { ScrollView, TouchableOpacity, View } from 'react-native';
import { ShoppingBag, ShieldCheck, Zap, BatteryCharging, Flashlight, Check } from 'lucide-react-native';
import { Text } from '../../components/Typography';
import { updatePickupStatus } from '../../api/pickups';
import { notify } from '../../components/confirm';
import { userMessage } from '../../utils/userMessages';
import { rf } from '../../utils/responsive';
import { Radio, SK, SellCard, SellCta, SellPage, PrefillNote } from './sellKit';

// Accessories & Warranty (codes as in the customer app's sell flow), then the
// inspection is saved with Device Collected (SellPickupController status
// DEVICE_PICKED_UP + inspection). One request at a time; the toast follows the
// server's answer.
const ACCESSORIES = [
  { id: 'original_charger', label: 'Original Charger', Icon: Zap },
  { id: 'battery_local', label: 'Battery Replaced From Local Market', Icon: BatteryCharging },
  { id: 'flashlight_not_working', label: 'Flash Light Not Working', Icon: Flashlight },
];
const WARRANTY = [
  { id: 'none', label: 'No Warranty' },
  { id: 'lt_3', label: '< 3 months' },
  { id: '3_6', label: '3 - 6 months' },
  { id: '6_11', label: '6 - 11 months' },
  { id: 'gt_11', label: '> 11 months' },
];
// Laptop / audio / watch / tablet purchases carry no warranty choice (as in the customer app).
const NO_WARRANTY = ['LAPTOP', 'AUDIO', 'WATCH', 'HEADPHONE', 'EARBUD', 'TABLET'];

export default function SellInspectAccessoriesScreen({ navigation, route }) {
  const params = route.params || {};
  const hints = params.editHints || {};
  const noWarranty = NO_WARRANTY.some((k) => String(params.device?.categoryCode || '').toUpperCase().includes(k));
  const list = noWarranty ? ACCESSORIES.slice(0, 1) : ACCESSORIES;
  const priorCodes = new Set((hints.accessories || []).map((a) => String(a?.accessoryCode || '').toLowerCase()).filter(Boolean));
  const [accessories, setAccessories] = useState(() => list.filter((a) => priorCodes.has(a.id)).map((a) => a.id));
  const [warranty, setWarranty] = useState(() => (WARRANTY.some((w) => w.id === hints.warrantyCode) ? hints.warrantyCode : null));
  const [saving, setSaving] = useState(false);
  const inFlight = useRef(false);
  const toggle = (id) => setAccessories((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSaving(true);
    const inspection = {
      device: params.device || null,
      workingCondition: params.workingCondition || null,
      screeningAnswers: params.screeningAnswers || [],
      conditions: params.conditions || [],
      issues: params.issues || [],
      accessories: list.filter((a) => accessories.includes(a.id)).map((a) => ({ accessoryCode: a.id, label: a.label })),
      warrantyCode: noWarranty ? null : warranty,
      warrantyLabel: noWarranty ? null : WARRANTY.find((w) => w.id === warranty)?.label || null,
    };
    try {
      await updatePickupStatus(params.bookingId, 'DEVICE_PICKED_UP', { inspection });
      notify('Device collected', 'Inspection saved. Take the device to the shop.', { type: 'success' });
      navigation.popTo('PickupAssign');
    } catch (e) {
      const code = e?.payload?.code;
      if (code === 'STALE_STATUS' || code === 'NOT_ASSIGNED') {
        notify('Pickup changed', 'This pickup was updated. Showing the latest status.', { type: 'info' });
        navigation.popTo('PickupAssign');
      } else {
        notify('Could not save inspection', userMessage(e, 'Please try again.'), { type: 'error' });
      }
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  };

  return (
    <SellPage
      title={noWarranty ? 'Accessories' : 'Accessories & Warranty'}
      subtitle="Accessories and warranty"
      navigation={navigation}
      footer={<SellCta title="Collect Device" onPress={submit} disabled={!noWarranty && !warranty} loading={saving} />}
    >
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 24 }}>
        {hints.accessories?.length || hints.warrantyCode ? <PrefillNote /> : null}
        <SellCard title="Accessories" Icon={ShoppingBag}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
            {list.map((a) => {
              const on = accessories.includes(a.id);
              return (
                <View key={a.id} style={{ width: '33.333%', padding: 4 }}>
                  <TouchableOpacity
                    onPress={() => toggle(a.id)}
                    activeOpacity={0.85}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    style={{
                      minHeight: 96, borderRadius: 14, padding: 8, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: on ? SK.tealSoft : SK.tile, borderWidth: on ? 2 : 1, borderColor: on ? SK.teal : SK.tile,
                    }}
                  >
                    {on ? (
                      <View style={{ position: 'absolute', top: 6, right: 6, height: 18, width: 18, borderRadius: 9, backgroundColor: SK.teal, alignItems: 'center', justifyContent: 'center' }}>
                        <Check size={11} color="#FFFFFF" strokeWidth={3} />
                      </View>
                    ) : null}
                    <View style={{ height: 38, width: 38, borderRadius: 19, backgroundColor: on ? SK.teal : '#DCE7EA', alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
                      <a.Icon size={18} color={on ? '#FFFFFF' : SK.teal} />
                    </View>
                    <Text style={{ fontSize: rf(12), fontWeight: '600', color: SK.ink, textAlign: 'center' }} numberOfLines={3}>{a.label}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        </SellCard>

        {!noWarranty ? (
          <SellCard title="Warranty" Icon={ShieldCheck}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
              {WARRANTY.map((w) => {
                const on = warranty === w.id;
                return (
                  <View key={w.id} style={{ width: '33.333%', padding: 4 }}>
                    <TouchableOpacity
                      onPress={() => setWarranty(w.id)}
                      activeOpacity={0.85}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      style={{
                        flexDirection: 'row', alignItems: 'center', minHeight: 46, borderRadius: 14, paddingHorizontal: 10,
                        backgroundColor: on ? SK.tealSoft : SK.tile, borderWidth: on ? 2 : 1, borderColor: on ? SK.teal : SK.tile,
                      }}
                    >
                      <Radio on={on} />
                      <Text style={{ flex: 1, marginLeft: 8, fontSize: rf(12), fontWeight: '700', color: SK.ink }} numberOfLines={2}>{w.label}</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </SellCard>
        ) : null}
      </ScrollView>
    </SellPage>
  );
}
