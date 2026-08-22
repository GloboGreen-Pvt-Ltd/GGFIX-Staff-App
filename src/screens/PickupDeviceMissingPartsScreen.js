import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../components/rnr';
import { rf } from '../utils/responsive';

const PARTS = [
  { id: 'DISPLAY', name: 'Display', icon: 'phone-portrait-outline' },
  { id: 'BACK_PANEL', name: 'Back Panel', icon: 'layers-outline' },
  { id: 'SIM_TRAY', name: 'SIM Card Tray', icon: 'card-outline' },
  { id: 'BUTTONS', name: 'Buttons', icon: 'radio-button-on-outline' },
  { id: 'CHARGING_PORT', name: 'Charging Port', icon: 'flash-outline' },
  { id: 'CAMERA', name: 'Camera', icon: 'camera-outline' },
  { id: 'SPEAKER', name: 'Speaker', icon: 'volume-high-outline' },
];

export default function PickupDeviceMissingPartsScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const params = route?.params || {};
  const [state, setState] = useState(() => {
    const prefill = Array.isArray(params.prefillMissingParts) ? params.prefillMissingParts : [];
    // On "Edit Estimate" the stored CSV is parsed back into { partName, missing,
    // damage } WITHOUT an id, so fall back to resolving the id by part name —
    // otherwise every previously-flagged part is dropped and re-submitting wipes
    // the saved missing/damaged selections.
    const idByName = {};
    for (const p of PARTS) idByName[p.name.trim().toLowerCase()] = p.id;
    const seed = {};
    for (const p of prefill) {
      let key = p.partId || p.id;
      if (!key && p.partName) key = idByName[String(p.partName).trim().toLowerCase()];
      if (!key) continue;
      seed[key] = { missing: !!p.missing, damage: !!p.damage, detail: p.detail || '' };
    }
    return seed;
  });

  const setField = (id, key, value) =>
    setState((p) => ({ ...p, [id]: { ...(p[id] || {}), [key]: value } }));

  const { missingCount, damageCount, flaggedItems } = useMemo(() => {
    let m = 0, d = 0;
    const items = [];
    for (const p of PARTS) {
      const row = state[p.id] || {};
      if (row.missing) m += 1;
      if (row.damage) d += 1;
      if (row.missing || row.damage) {
        items.push({
          partId: p.id,
          partName: p.name,
          missing: !!row.missing,
          damage: !!row.damage,
          detail: row.detail || null,
        });
      }
    }
    return { missingCount: m, damageCount: d, flaggedItems: items };
  }, [state]);

  const onContinue = () => {
    navigation.navigate('PickupServiceBookingDevicesList', {
      ...params,
      missingParts: flaggedItems,
    });
  };

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-4 pt-4 pb-32">
        <Text className="text-text-muted text-xs px-1 mb-2">Flag any part that's missing or damaged on this device.</Text>

        <View className="flex-row mb-4">
          <View className="flex-1 bg-danger/10 border border-danger/30 rounded-xl px-3 py-2 mr-2">
            <Text className="text-danger font-extrabold tracking-widest" style={{ fontSize: rf(10) }}>MISSING</Text>
            <Text className="font-extrabold text-danger mt-0.5" style={{ fontSize: rf(18) }}>{missingCount}</Text>
          </View>
          <View className="flex-1 bg-warning/10 border border-warning/30 rounded-xl px-3 py-2">
            <Text className="text-warning font-extrabold tracking-widest" style={{ fontSize: rf(10) }}>DAMAGED</Text>
            <Text className="font-extrabold text-warning mt-0.5" style={{ fontSize: rf(18) }}>{damageCount}</Text>
          </View>
        </View>

        {PARTS.map((p) => {
          const row = state[p.id] || {};
          const anyFlag = row.missing || row.damage;
          return (
            <View
              key={p.id}
              className={`bg-card border rounded-2xl p-3 mb-2.5 ${anyFlag ? 'border-primary/40' : 'border-border'}`}
            >
              <View className="flex-row items-center">
                <View className={`w-10 h-10 rounded-xl items-center justify-center mr-2.5 ${anyFlag ? 'bg-primary/15' : 'bg-primary/10'}`}>
                  <Ionicons name={p.icon} size={18} color="#00008B" />
                </View>
                <Text className="flex-1 font-extrabold text-text" style={{ fontSize: rf(14) }} numberOfLines={1}>{p.name}</Text>
                <Pressable
                  onPress={() => setField(p.id, 'missing', !row.missing)}
                  className={`mr-2 rounded-full px-3 py-1.5 ${row.missing ? 'bg-danger' : 'bg-background border border-border'}`}
                >
                  <Text style={{ fontSize: rf(11) }} className={`font-bold ${row.missing ? 'text-white' : 'text-text-muted'}`}>Missing</Text>
                </Pressable>
                <Pressable
                  onPress={() => setField(p.id, 'damage', !row.damage)}
                  className={`rounded-full px-3 py-1.5 ${row.damage ? 'bg-warning' : 'bg-background border border-border'}`}
                >
                  <Text style={{ fontSize: rf(11) }} className={`font-bold ${row.damage ? 'text-white' : 'text-text-muted'}`}>Damage</Text>
                </Pressable>
              </View>
              {anyFlag ? (
                <TextInput
                  placeholder="Add details (optional)"
                  placeholderTextColor="#94A3B8"
                  value={row.detail || ''}
                  onChangeText={(v) => setField(p.id, 'detail', v)}
                  className="mt-2.5 bg-background border border-border rounded-xl px-3 py-2 text-text" style={{ fontSize: rf(13) }}
                />
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      <View className="absolute left-0 right-0 bottom-0 p-4 bg-card border-t border-border" style={{ paddingBottom: Math.max(insets.bottom, 12) + 10, shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -4 }, elevation: 12 }}>
        <Button
          rightIcon={<Ionicons name="chevron-forward" size={20} color="#fff" />}
          onPress={onContinue}
        >
          Continue
        </Button>
      </View>
    </View>
  );
}
