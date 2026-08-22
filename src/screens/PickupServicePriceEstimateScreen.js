import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, Pressable, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Checkbox, FormField, Select } from '../components/rnr';
import { normalizeDeviceImageUrl } from '../utils/images';
import { notify } from '../components/confirm';

const DURATIONS = [1, 2, 3, 4, 5, 6, 8, 12, 24, 48].map((h) => ({ value: h, label: `${h} - Hr` }));

const formatDate = (d) => d.toDateString();
const formatTime = (d) => {
  let h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}.${m} ${ampm}`;
};

function trackingId(booking, params) {
  return params?.trackingId
    || booking?.bookingNumber
    || `#${String(booking?.id || '').replace(/[^0-9a-zA-Z]/g, '').slice(0, 12).toUpperCase()}`;
}

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

export default function PickupServicePriceEstimateScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const params = route?.params || {};
  const booking = params.booking || null;
  const services = params.services || [];
  const total = services.reduce((sum, s) => sum + (Number(s.price) || 0), 0);

  const [now] = useState(() => new Date());
  const [imei, setImei] = useState(params.prefillImei || '');
  const [complaint, setComplaint] = useState(params.prefillComplaint || booking?.issueSummary || '');
  // Derive the initial duration from the previously-saved schedule when the
  // pickup person re-enters the wizard from Edit Repair Estimate. Pick the
  // closest entry in DURATIONS so the Select component reflects a real option.
  const [duration, setDuration] = useState(() => {
    const readyIso = params.prefillEstimatedReadyIso;
    const deliveryIso = params.prefillEstimatedDeliveryIso;
    if (!readyIso || !deliveryIso) return 2;
    const ready = new Date(readyIso).getTime();
    const delivery = new Date(deliveryIso).getTime();
    if (!Number.isFinite(ready) || !Number.isFinite(delivery) || delivery <= ready) return 2;
    const hrs = (delivery - ready) / 3600000;
    let best = DURATIONS[0].value;
    let diff = Math.abs(hrs - best);
    for (const opt of DURATIONS) {
      const d = Math.abs(hrs - opt.value);
      if (d < diff) { best = opt.value; diff = d; }
    }
    return best;
  });
  const [approval, setApproval] = useState(() => !!params.prefillCustomerApproved);

  const dateLabel = formatDate(now);
  const timeLabel = formatTime(now);
  const delivery = new Date(now.getTime() + duration * 60 * 60 * 1000);
  const deliveryLabel = `${formatDate(delivery)} - ${formatTime(delivery)}`;
  const imageUri = deviceImageUri(booking, params);
  const colorText = params.color || booking?.color || null;

  const onContinue = () => {
    if (!complaint.trim()) {
      notify('Complaint required', 'Please describe the issue before continuing.', { preset: 'error' });
      return;
    }
    // Stamp "ready at" at submit time, not screen-open time. `now` is frozen at
    // mount for the on-screen preview, but the pickup person may fill the form
    // slowly — persisting the mount time would back-date the estimate and offset
    // the delivery from a stale base. Recompute fresh at the moment of submit.
    const submittedAt = new Date();
    const submittedDelivery = new Date(submittedAt.getTime() + duration * 60 * 60 * 1000);
    navigation.navigate('PickupDeviceInformation', {
      ...params,
      imei: imei.trim(),
      complaint: complaint.trim(),
      estimatedAt: `${formatDate(submittedAt)} ${formatTime(submittedAt)}, ${duration}Hr`,
      estimatedDelivery: `${formatDate(submittedDelivery)} - ${formatTime(submittedDelivery)}`,
      estimatedReadyIso: submittedAt.toISOString(),
      estimatedDeliveryIso: submittedDelivery.toISOString(),
      durationHours: duration,
      customerApproved: approval,
    });
  };

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-4 pt-4 pb-32" keyboardShouldPersistTaps="handled">
        <Card className="flex-row items-center mb-4">
          <View className="w-14 h-16 bg-border rounded-md overflow-hidden items-center justify-center">
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={{ width: 56, height: 64 }} resizeMode="cover" />
            ) : (
              <Ionicons name="phone-portrait-outline" size={24} color="#64748B" />
            )}
          </View>
          <View className="ml-3 flex-1">
            <Text className="text-text-muted text-xs">Tracking ID : <Text className="font-bold text-text">{trackingId(booking, params)}</Text></Text>
            {deviceTitle(booking, params) ? (
              <Text className="text-text-muted text-xs mt-1">Device : <Text className="font-bold text-text">{deviceTitle(booking, params)}</Text></Text>
            ) : null}
            {colorText ? (
              <Text className="text-text-muted text-xs mt-1">Color : <Text className="font-bold text-text">{colorText}</Text></Text>
            ) : null}
          </View>
        </Card>

        <Card className="mb-4">
          <Text className="font-bold text-text mb-3 pb-2 border-b border-border">Price Summary</Text>
          {services.map((s, i) => (
            <View key={i} className="flex-row items-center mb-2">
              <View className="w-6 h-6 bg-background rounded items-center justify-center mr-2">
                <Text className="text-text text-xs font-bold">{i + 1}</Text>
              </View>
              <Text className="flex-1 text-text">{s.serviceName}</Text>
              <Text className="font-bold text-text">₹{Number(s.price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
            </View>
          ))}
          <View className="border-t border-border mt-2 pt-2 flex-row items-center">
            <Text className="flex-1 font-bold text-text">Estimated Repair Amount</Text>
            <Text className="font-bold text-text">₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Text>
          </View>
        </Card>

        <FormField label="IMEI Number">
          <View className="flex-row items-center bg-card border border-border rounded-xl px-3">
            <TextInput
              className="flex-1 py-3 text-text"
              placeholder="Enter IMEI Number or Scan"
              placeholderTextColor="#94A3B8"
              value={imei}
              onChangeText={setImei}
            />
            <Pressable className="p-2"><Ionicons name="barcode-outline" size={22} color="#0F172A" /></Pressable>
          </View>
        </FormField>

        <Text className="text-text font-bold mb-2">Complaint Notes</Text>
        <TextInput
          className="bg-card border border-primary rounded-xl px-4 py-3 text-text mb-4"
          placeholder="Enter you issue"
          placeholderTextColor="#94A3B8"
          value={complaint}
          onChangeText={setComplaint}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          style={{ minHeight: 100 }}
        />

        <Card>
          <Text className="font-bold text-text mb-2">Estimated Approximate Time</Text>
          <View className="flex-row">
            <View className="flex-1 mr-2">
              <Text className="text-xs text-text-muted mb-1">Date</Text>
              <View className="bg-background border border-border rounded-xl px-3 py-2">
                <Text className="text-text text-xs">{dateLabel}</Text>
              </View>
            </View>
            <View className="flex-1 mr-2">
              <Text className="text-xs text-text-muted mb-1">Time</Text>
              <View className="bg-background border border-border rounded-xl px-3 py-2">
                <Text className="text-text text-xs">{timeLabel}</Text>
              </View>
            </View>
            <View className="w-24">
              <Text className="text-xs text-text-muted mb-1">Duration</Text>
              <Select value={duration} options={DURATIONS} onChange={(v) => setDuration(v)} className="py-2" />
            </View>
          </View>
          <Text className="font-bold text-text mt-3 mb-1">Estimated Delivery Time</Text>
          <View className="bg-card border border-border rounded-xl px-3 py-2">
            <Text className="text-text text-xs">{deliveryLabel}</Text>
          </View>
          <View className="flex-row items-center mt-3">
            <Text className="flex-1 font-semibold text-text">Customer Repair Approval</Text>
            <Checkbox checked={approval} onChange={setApproval} />
          </View>
        </Card>
      </ScrollView>

      <View className="absolute left-0 right-0 bottom-0 p-4 bg-card border-t border-border" style={{ paddingBottom: Math.max(insets.bottom, 12) + 10 }}>
        <Button rightIcon={<Ionicons name="chevron-forward" size={20} color="#fff" />} onPress={onContinue}>
          Continue
        </Button>
      </View>
    </View>
  );
}
