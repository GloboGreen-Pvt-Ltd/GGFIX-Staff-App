import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import {
  Check,
  ChevronRight,
  HardDrive,
  MemoryStick,
  Palette,
  Smartphone,
} from 'lucide-react-native';
import { Button, Card } from '../components/rnr';
import { notify } from '../components/confirm';
import { listColors, listRamOptions, listStorageOptions } from '../api/master';
import { normalizeDeviceImageUrl } from '../utils/images';
import { rf } from '../utils/responsive';

function trackingId(booking) {
  return booking?.bookingNumber
    || `#${String(booking?.id || '').replace(/[^0-9a-zA-Z]/g, '').slice(0, 12).toUpperCase()}`;
}

// Some master_ram_options / master_storage_options rows have an empty `label`
// even though `valueGb` is populated — and one row has "GB" with no number.
// Prefer a non-blank label that actually contains a digit; otherwise build
// the label from `valueGb`. Last resort: fall back to the raw label, then id.
function ramLabelFor(opt) {
  if (!opt) return '';
  const rawLabel = typeof opt.label === 'string' ? opt.label.trim() : '';
  if (rawLabel && /\d/.test(rawLabel)) return rawLabel;
  if (opt.valueGb != null && opt.valueGb !== '') {
    const n = Number(opt.valueGb);
    if (Number.isFinite(n) && n >= 1024) return `${n / 1024} TB`;
    return `${opt.valueGb} GB`;
  }
  if (rawLabel) return rawLabel;
  return String(opt.id || '');
}

function storageLabelFor(opt) {
  return ramLabelFor(opt);
}

function modelImageUri(params) {
  const url = normalizeDeviceImageUrl(params?.modelImageUrl || params?.model?.imageUrl);
  if (url) return url;
  const b64 = params?.modelImageBase64 || params?.model?.imageBase64;
  if (!b64) return null;
  return String(b64).startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
}

function SectionCard({ icon: Icon, title, hint, children }) {
  return (
    <Card className="mb-3">
      <View className="flex-row items-center mb-3">
        <View className="w-8 h-8 rounded-lg bg-primary/10 items-center justify-center mr-2">
          <Icon size={16} color="#00008B" />
        </View>
        <View className="flex-1">
          <Text className="text-text font-extrabold" style={{ fontSize: rf(13) }}>{title}</Text>
          {hint ? <Text className="text-text-muted mt-0.5" style={{ fontSize: rf(10) }}>{hint}</Text> : null}
        </View>
      </View>
      {children}
    </Card>
  );
}

export default function PickupDeviceColorStorageScreen({ navigation, route }) {
  const params = route?.params || {};
  const booking = params.booking || null;

  const [ramOptions, setRamOptions] = useState([]);
  const [storageOptions, setStorageOptions] = useState([]);
  const [colors, setColors] = useState([]);
  const [loading, setLoading] = useState(true);

  // Customer-supplied seeds. Used both for the live state and to flag the
  // "Customer picked" pill in each section.
  const customerColor = params.color || booking?.color || '';
  const customerRamOptionId = booking?.ramOptionId || params.ramOptionId || null;
  const customerStorageOptionId = booking?.storageOptionId || params.storageOptionId || null;

  const [colorText, setColorText] = useState(customerColor);
  const [ramOptionId, setRamOptionId] = useState(customerRamOptionId);
  const [storageOptionId, setStorageOptionId] = useState(customerStorageOptionId);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      listRamOptions().catch(() => []),
      listStorageOptions().catch(() => []),
      listColors().catch(() => []),
    ])
      .then(([r, s, c]) => {
        if (cancelled) return;
        setRamOptions(Array.isArray(r) ? r : []);
        setStorageOptions(Array.isArray(s) ? s : []);
        setColors(Array.isArray(c) ? c : []);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const selectedRam = useMemo(
    () => ramOptions.find((r) => String(r.id) === String(ramOptionId)) || null,
    [ramOptions, ramOptionId],
  );
  const selectedStorage = useMemo(
    () => storageOptions.find((s) => String(s.id) === String(storageOptionId)) || null,
    [storageOptions, storageOptionId],
  );

  const customerRamLabel = useMemo(() => {
    if (!customerRamOptionId) return null;
    const match = ramOptions.find((r) => String(r.id) === String(customerRamOptionId));
    if (match) return ramLabelFor(match);
    return booking?.ramLabel || null;
  }, [customerRamOptionId, ramOptions, booking?.ramLabel]);

  const customerStorageLabel = useMemo(() => {
    if (!customerStorageOptionId) return null;
    const match = storageOptions.find((s) => String(s.id) === String(customerStorageOptionId));
    if (match) return storageLabelFor(match);
    return booking?.storageLabel || null;
  }, [customerStorageOptionId, storageOptions, booking?.storageLabel]);

  const onContinue = () => {
    if (!colorText.trim()) {
      notify('Color required', 'Enter the device color.');
      return;
    }
    if (!ramOptionId) {
      notify('RAM required', 'Select the device RAM.');
      return;
    }
    if (!storageOptionId) {
      notify('Storage required', 'Select the device storage.');
      return;
    }
    navigation.navigate('PickupDeviceServices', {
      ...params,
      color: colorText.trim(),
      ramOptionId,
      storageOptionId,
      ramLabel: ramLabelFor(selectedRam),
      storageLabel: storageLabelFor(selectedStorage),
    });
  };

  if (loading) {
    return (
      <View className="flex-1 bg-background items-center justify-center">
        <ActivityIndicator color="#00008B" />
      </View>
    );
  }

  const imageUri = modelImageUri(params);
  const brandName = params.brandName || params.brand?.name || booking?.brandName || '—';
  const modelName = params.modelName || params.model?.name || booking?.modelName || '—';

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerStyle={{ padding: 14, paddingBottom: 32 }}>
        <Card className="flex-row items-center mb-3">
          <View className="h-14 w-14 rounded-xl bg-primary/10 items-center justify-center mr-3 overflow-hidden">
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={{ width: 48, height: 48 }} resizeMode="contain" />
            ) : (
              <Smartphone size={24} color="#00008B" />
            )}
          </View>
          <View className="flex-1">
            <Text className="text-text-muted uppercase tracking-widest font-bold" style={{ fontSize: rf(10) }}>
              Selected Device
            </Text>
            <Text className="font-extrabold text-text mt-0.5" style={{ fontSize: rf(13) }} numberOfLines={1}>
              {brandName} {modelName}
            </Text>
            <Text className="text-text-muted mt-0.5" style={{ fontSize: rf(10) }} numberOfLines={1}>
              Tracking: {trackingId(booking)}
            </Text>
          </View>
        </Card>

        <SectionCard icon={Palette} title="Model Color" hint="Type or pick a swatch">
          {customerColor ? (
            <View className="flex-row items-center mb-2 self-start bg-primary/10 border border-primary/30 rounded-full pl-1.5 pr-2.5 py-0.5">
              <View className="w-3.5 h-3.5 rounded-full bg-primary items-center justify-center mr-1">
                <Check size={9} color="#FFFFFF" />
              </View>
              <Text className="text-primary font-extrabold tracking-wide" style={{ fontSize: rf(10) }}>
                Customer picked {customerColor}
              </Text>
            </View>
          ) : null}
          <TextInput
            value={colorText}
            onChangeText={setColorText}
            placeholder="Enter device color (e.g. Beige, Midnight)"
            placeholderTextColor="#94A3B8"
            className="bg-background border border-border rounded-xl px-3 py-2.5 text-text" style={{ fontSize: rf(13) }}
          />
          {colors.length > 0 ? (
            <View className="flex-row flex-wrap mt-2 -mx-1">
              {colors.map((c) => {
                const active = (colorText || '').toLowerCase() === (c.name || '').toLowerCase();
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => setColorText(c.name || '')}
                    className={`px-3 py-1.5 m-1 rounded-full border ${active ? 'bg-primary border-primary' : 'bg-card border-border'}`}
                  >
                    <Text style={{ fontSize: rf(11) }} className={`font-bold ${active ? 'text-white' : 'text-text'}`}>
                      {c.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </SectionCard>

        <SectionCard icon={MemoryStick} title="RAM" hint="Pick the installed memory">
          {customerRamLabel ? (
            <View className="flex-row items-center mb-2 self-start bg-primary/10 border border-primary/30 rounded-full pl-1.5 pr-2.5 py-0.5">
              <View className="w-3.5 h-3.5 rounded-full bg-primary items-center justify-center mr-1">
                <Check size={9} color="#FFFFFF" />
              </View>
              <Text className="text-primary font-extrabold tracking-wide" style={{ fontSize: rf(10) }}>
                Customer picked {customerRamLabel}
              </Text>
            </View>
          ) : null}
          {ramOptions.length === 0 ? (
            <Text className="text-text-muted" style={{ fontSize: rf(12) }}>No RAM options configured.</Text>
          ) : (
            <View className="flex-row flex-wrap -mx-1">
              {ramOptions.map((r) => {
                const active = String(r.id) === String(ramOptionId);
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => setRamOptionId(r.id)}
                    className={`flex-row items-center px-3 py-2 m-1 rounded-xl border ${active ? 'bg-primary border-primary' : 'bg-card border-border'}`}
                  >
                    <MemoryStick size={14} color={active ? '#fff' : '#0F172A'} />
                    <Text style={{ fontSize: rf(12) }} className={`ml-1.5 font-bold ${active ? 'text-white' : 'text-text'}`}>
                      {ramLabelFor(r)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </SectionCard>

        <SectionCard icon={HardDrive} title="Storage" hint="Pick the device storage size">
          {customerStorageLabel ? (
            <View className="flex-row items-center mb-2 self-start bg-primary/10 border border-primary/30 rounded-full pl-1.5 pr-2.5 py-0.5">
              <View className="w-3.5 h-3.5 rounded-full bg-primary items-center justify-center mr-1">
                <Check size={9} color="#FFFFFF" />
              </View>
              <Text className="text-primary font-extrabold tracking-wide" style={{ fontSize: rf(10) }}>
                Customer picked {customerStorageLabel}
              </Text>
            </View>
          ) : null}
          {storageOptions.length === 0 ? (
            <Text className="text-text-muted" style={{ fontSize: rf(12) }}>No storage options configured.</Text>
          ) : (
            <View className="flex-row flex-wrap -mx-1">
              {storageOptions.map((s) => {
                const active = String(s.id) === String(storageOptionId);
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => setStorageOptionId(s.id)}
                    className={`flex-row items-center px-3 py-2 m-1 rounded-xl border ${active ? 'bg-primary border-primary' : 'bg-card border-border'}`}
                  >
                    <HardDrive size={14} color={active ? '#fff' : '#0F172A'} />
                    <Text style={{ fontSize: rf(12) }} className={`ml-1.5 font-bold ${active ? 'text-white' : 'text-text'}`}>
                      {storageLabelFor(s)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}
        </SectionCard>

        <Button
          rightIcon={<ChevronRight size={18} color="#fff" />}
          onPress={onContinue}
          fullWidth
          className="mt-2"
        >
          Continue to Services
        </Button>
      </ScrollView>
    </View>
  );
}
