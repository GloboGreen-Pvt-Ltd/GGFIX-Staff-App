import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Wrench,
  BatteryMedium,
  Cpu,
  Zap,
  Volume2,
  Aperture,
  LayoutGrid,
  Smartphone,
  Droplets,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
} from 'lucide-react-native';
import { Button, Card } from '../components/rnr';
import { listAllRepairServices, listRepairCategories } from '../api/master';
import { normalizeDeviceImageUrl } from '../utils/images';
import { rf } from '../utils/responsive';

const WARRANTY_OPTIONS = [
  { code: 'W_3M', label: '3 Months' },
  { code: 'W_6M', label: '6 Months' },
  { code: 'W_12M', label: '12 Months' },
];

const priceNum = (v) => Number(String(v ?? '').replace(/[^0-9.]/g, '')) || 0;

function trackingId(booking, params) {
  return params?.trackingId
    || booking?.bookingNumber
    || `#${String(booking?.id || '').replace(/[^0-9a-zA-Z]/g, '').slice(0, 12).toUpperCase()}`;
}

// Prefer the just-picked values (route params from the Brand/Model/Color
// screens) over what was saved on the booking — the pickup person may have
// corrected the customer's original entry.
function deviceTitle(booking, params) {
  const parts = [];
  const brand = params?.brandName || params?.brand?.name || booking?.brandName;
  const model = params?.modelName || params?.model?.name || booking?.modelName;
  if (brand) parts.push(brand);
  if (model) parts.push(model);
  const head = parts.join(' ');
  const specs = [];
  const ramLabel = params?.ramLabel || booking?.ramLabel;
  const storageLabel = params?.storageLabel || booking?.storageLabel;
  if (ramLabel) specs.push(ramLabel);
  if (storageLabel) specs.push(storageLabel);
  if (specs.length === 0) return head;
  return head ? `${head} · ${specs.join(' · ')}` : specs.join(' · ');
}

function base64ImageUri(raw) {
  if (!raw) return null;
  const value = String(raw);
  return value.startsWith('data:') ? value : `data:image/png;base64,${value}`;
}

function deviceImageUri(booking, params) {
  const url = normalizeDeviceImageUrl(
    params?.modelImageUrl
      || params?.model?.imageUrl
      || booking?.deviceImageUrl
      || booking?.modelImageUrl
  );
  if (url) return url;
  return base64ImageUri(
    params?.modelImageBase64
      || params?.model?.imageBase64
      || booking?.deviceImageBase64
      || booking?.modelImageBase64
  );
}

function normalizePrefillServices(...sources) {
  const byId = new Map();
  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    for (const s of source) {
      const rawId = s?.serviceId || s?.repairServiceId || s?.repair_service_id;
      if (!rawId) continue;
      const serviceId = String(rawId);
      byId.set(serviceId, {
        serviceId,
        serviceCode: s.serviceCode || s.code || s.service_code || null,
        serviceName: s.serviceName || s.name || s.service_name || 'Selected Issue',
        price: s.price ?? s.estimatedPrice ?? s.estimated_price ?? '',
        warranty: s.warranty || null,
      });
    }
  }
  return Array.from(byId.values());
}

export default function PickupDeviceServicesScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const params = route?.params || {};
  const booking = params.booking || null;
  const bookingId = params.bookingId || booking?.id;
  const [services, setServices] = useState([]);
  const [mainCats, setMainCats] = useState([]);
  const [loading, setLoading] = useState(true);

  const prefillServices = useMemo(
    () => normalizePrefillServices(params.prefillServices, booking?.services),
    [params.prefillServices, booking?.services],
  );

  const seedFromPrefill = () => {
    const rowSeed = {};
    const idSeed = new Set();
    for (const s of prefillServices) {
      if (!s?.serviceId) continue;
      rowSeed[s.serviceId] = { price: String(s.price ?? ''), warranty: s.warranty || '' };
      idSeed.add(s.serviceId);
    }
    return { rowSeed, idSeed };
  };
  const seed = useMemo(seedFromPrefill, [prefillServices]);
  const [rows, setRows] = useState(seed.rowSeed);
  const [pickedIds, setPickedIds] = useState(() => new Set(seed.idSeed));
  const [expanded, setExpanded] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const [s, c] = await Promise.all([
          listAllRepairServices().catch(() => []),
          listRepairCategories({}).catch(() => []),
        ]);
        setServices(s);
        setMainCats(c);
      } catch (_) {}
      setLoading(false);
    })();
  }, []);

  const allServices = useMemo(() => {
    const normalized = (services || [])
      .filter((s) => s?.id)
      .map((s) => ({ ...s, id: String(s.id) }));
    const existingIds = new Set(normalized.map((s) => s.id));
    const missingSelected = prefillServices
      .filter((s) => s.serviceId && !existingIds.has(s.serviceId))
      .map((s) => ({
        id: s.serviceId,
        code: s.serviceCode,
        name: s.serviceName,
        categoryId: '__customer_selected__',
      }));
    return [...normalized, ...missingSelected];
  }, [services, prefillServices]);

  const groups = useMemo(() => {
    const catById = {};
    (mainCats || []).forEach((c) => { catById[c.id] = c; });
    const byCat = new Map();
    (allServices || []).forEach((s) => {
      const key = s.categoryId || '__ungrouped__';
      if (!byCat.has(key)) {
        byCat.set(key, {
          id: key,
          name: key === '__customer_selected__' ? 'Customer Selected Issues' : (catById[key]?.name || 'Other'),
          services: [],
        });
      }
      byCat.get(key).services.push(s);
    });
    return Array.from(byCat.values());
  }, [allServices, mainCats]);

  useEffect(() => {
    if (pickedIds.size === 0 || groups.length === 0) return;
    setExpanded((prev) => {
      const next = { ...prev };
      let touched = false;
      for (const g of groups) {
        if (next[g.id]) continue;
        if (g.services.some((s) => pickedIds.has(String(s.id)))) { next[g.id] = true; touched = true; }
      }
      return touched ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups]);

  const ensureRow = (id) => rows[id] || { price: '', warranty: '' };
  const setField = (id, key, value) => {
    setRows((p) => {
      const existing = p[id] || { price: '', warranty: '' };
      return { ...p, [id]: { ...existing, [key]: value } };
    });
  };

  const addService = (s) => {
    const sid = String(s.id);
    if (!(priceNum(ensureRow(sid).price) > 0)) return;
    setPickedIds((p) => { const n = new Set(p); n.add(sid); return n; });
  };
  const removeService = (s) => {
    const sid = String(s.id);
    setPickedIds((p) => { const n = new Set(p); n.delete(sid); return n; });
  };

  const toggleGroup = (gid) => setExpanded((e) => ({ ...e, [gid]: !e[gid] }));

  const onContinue = () => {
    const byId = {}; (allServices || []).forEach((s) => { byId[String(s.id)] = s; });
    const selected = [...pickedIds].map((id) => {
      const s = byId[id]; const r = ensureRow(id);
      return {
        serviceId: id,
        serviceCode: s?.code,
        serviceName: s?.name,
        price: priceNum(r.price),
        warranty: r.warranty || null,
      };
    });
    if (selected.length === 0) return;
    // Forward every selection from the upstream Brand/Model/Color steps so
    // the price estimate + final submit screens can display + persist the
    // pickup-person-corrected brand/model/color/RAM/storage on the booking.
    navigation.navigate('PickupServicePriceEstimate', {
      ...params,
      bookingId,
      booking,
      services: selected,
    });
  };

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color="#00008B" />
      </View>
    );
  }

  const totalSelected = pickedIds.size;
  const imageUri = deviceImageUri(booking, params);
  const colorText = params.color || booking?.color || null;
  const customerName = booking?.customerName || params.customerName || null;

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        <Card className="flex-row items-center mb-4 rounded-2xl">
          <View className="h-14 w-14 rounded-xl bg-primary/10 items-center justify-center mr-3 overflow-hidden">
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={{ width: 56, height: 56 }} resizeMode="cover" />
            ) : (
              <Smartphone size={26} color="#00008B" />
            )}
          </View>
          <View className="flex-1">
            <Text className="text-text-muted uppercase tracking-widest" style={{ fontSize: rf(11) }}>Device</Text>
            <Text className="font-extrabold text-text mt-0.5" style={{ fontSize: rf(14) }} numberOfLines={1}>
              {deviceTitle(booking, params) || trackingId(booking, params)}
            </Text>
            {colorText ? (
              <Text className="text-text-muted mt-0.5" style={{ fontSize: rf(12) }}>Color: {colorText}</Text>
            ) : null}
            <Text className="text-text-muted mt-0.5" style={{ fontSize: rf(10) }}>Tracking: {trackingId(booking, params)}</Text>
            {customerName ? (
              <Text className="text-text-muted mt-0.5" style={{ fontSize: rf(10) }}>Customer: {customerName}</Text>
            ) : null}
          </View>
        </Card>

        {groups.map((g) => {
          const open = !!expanded[g.id];
          const pickedInGroup = g.services.filter((s) => pickedIds.has(String(s.id))).length;
          const Chevron = open ? ChevronUp : ChevronDown;
          return (
            <View key={g.id} className="mb-3 bg-card border border-border rounded-2xl overflow-hidden">
              <Pressable
                onPress={() => toggleGroup(g.id)}
                className="flex-row items-center px-3 py-3 active:opacity-80"
              >
                <View className="h-9 w-9 rounded-xl bg-primary/10 items-center justify-center mr-2.5">
                  <Wrench size={16} color="#00008B" />
                </View>
                <View className="flex-1">
                  <Text className="font-extrabold text-text" style={{ fontSize: rf(14) }} numberOfLines={1}>{g.name}</Text>
                  <Text className="text-text-muted mt-0.5" style={{ fontSize: rf(10) }}>
                    {g.services.length} issue{g.services.length === 1 ? '' : 's'}
                    {pickedInGroup ? ` · ${pickedInGroup} selected` : ''}
                  </Text>
                </View>
                <Chevron size={18} color="#64748B" />
              </Pressable>

              {open ? (
                <View className="px-3 pb-3">
                  {g.services.map((s) => {
                    const sid = String(s.id);
                    const r = ensureRow(sid);
                    const isPicked = pickedIds.has(sid);
                    const Icon = iconFor(s.code);
                    const canAdd = priceNum(r.price) > 0;
                    return (
                      <View key={sid} className={`border rounded-2xl p-3 mb-2 ${isPicked ? 'border-primary bg-primary/5' : 'border-border bg-background'}`}>
                        <View className="flex-row items-start">
                          <View className={`h-10 w-10 rounded-xl items-center justify-center mr-3 ${isPicked ? 'bg-primary' : 'bg-card'}`}>
                            <Icon size={18} color={isPicked ? '#fff' : '#0F172A'} />
                          </View>
                          <View className="flex-1 pr-2">
                            <Text className="font-extrabold text-text" style={{ fontSize: rf(13) }} numberOfLines={1}>{s.name}</Text>
                            <View className="flex-row items-center mt-2">
                              <View className={`flex-row items-center rounded-lg border px-2 ${isPicked ? 'border-primary/40 bg-card' : 'border-border bg-card'}`}>
                                <Text className="text-text-muted mr-1" style={{ fontSize: rf(13) }}>₹</Text>
                                <TextInput
                                  placeholder="0.00"
                                  placeholderTextColor="#94A3B8"
                                  keyboardType="numeric"
                                  value={String(r.price ?? '')}
                                  onChangeText={(v) => setField(sid, 'price', v)}
                                  className="text-text py-1.5 min-w-[88px]"
                                  style={{ fontSize: rf(13), paddingVertical: 6 }}
                                />
                              </View>
                            </View>
                          </View>
                          <View className="items-end">
                            {isPicked ? (
                              <Pressable
                                onPress={() => removeService(s)}
                                className="flex-row items-center bg-danger/10 border border-danger/30 rounded-full px-3 py-1.5 active:opacity-70"
                              >
                                <X size={12} color="#EF4444" />
                                <Text className="text-danger font-bold ml-1" style={{ fontSize: rf(12) }}>Remove</Text>
                              </Pressable>
                            ) : (
                              <Pressable
                                disabled={!canAdd}
                                onPress={() => addService(s)}
                                className={`flex-row items-center rounded-full px-3.5 py-1.5 ${canAdd ? 'bg-primary active:opacity-80' : 'bg-primary/40'}`}
                              >
                                <Plus size={12} color="#fff" />
                                <Text className="text-white font-bold ml-1" style={{ fontSize: rf(12) }}>Add</Text>
                              </Pressable>
                            )}
                          </View>
                        </View>

                        <View className="mt-3">
                          <Text className="font-bold text-text-muted tracking-widest mb-1.5" style={{ fontSize: rf(10) }}>WARRANTY</Text>
                          <View className="flex-row -mx-1">
                            {WARRANTY_OPTIONS.map((w) => {
                              const active = r.warranty === w.code;
                              return (
                                <Pressable
                                  key={w.code}
                                  onPress={() => setField(sid, 'warranty', w.code)}
                                  className={`flex-1 mx-1 py-2 rounded-xl border items-center ${active ? 'bg-primary border-primary' : 'bg-card border-border'}`}
                                >
                                  <Text numberOfLines={1} style={{ fontSize: rf(11) }} className={`font-bold ${active ? 'text-white' : 'text-text'}`}>{w.label}</Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      <View className="absolute left-0 right-0 bottom-0 p-4 bg-card border-t border-border" style={{ paddingBottom: Math.max(insets.bottom, 12) + 10, shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -4 }, elevation: 12 }}>
        <Button
          rightIcon={<ChevronRight size={18} color="#fff" />}
          onPress={onContinue}
          disabled={totalSelected === 0}
          fullWidth
        >
          Continue ({totalSelected} selected)
        </Button>
      </View>
    </View>
  );
}

function iconFor(code) {
  switch (code) {
    case 'DISPLAY': return Smartphone;
    case 'BATTERY': return BatteryMedium;
    case 'MOTHERBOARD': return Cpu;
    case 'CHARGING_PORT': return Zap;
    case 'SPEAKER': return Volume2;
    case 'CAMERA': return Aperture;
    case 'BUTTON': return LayoutGrid;
    case 'WATER_DAMAGE': return Droplets;
    case 'DEAD_PHONE': return Smartphone;
    default: return Wrench;
  }
}
