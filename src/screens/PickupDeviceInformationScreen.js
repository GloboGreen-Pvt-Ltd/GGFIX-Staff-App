import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, Image, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Button, Card } from '../components/rnr';
import { notify } from '../components/confirm';
import { uploadMedia } from '../api/media';
import { normalizeDeviceImageUrl } from '../utils/images';
import { rf } from '../utils/responsive';

const SLOTS = [
  { key: 'front', label: 'Front Side', isVideo: false },
  { key: 'back', label: 'Back Side', isVideo: false },
  { key: 'video', label: 'Full Coverage Video', isVideo: true },
];

function trackingId(booking, params) {
  return params?.trackingId
    || booking?.bookingNumber
    || `#${String(booking?.id || '').replace(/[^0-9a-zA-Z]/g, '').slice(0, 12).toUpperCase()}`;
}

function deviceTitle(booking, params) {
  // Wizard-state has priority over the original booking — the pickup person
  // may have re-picked brand/model upstream, so reading from params first
  // keeps every wizard screen consistent.
  const brand = params?.brandName || params?.brand?.name || booking?.brandName;
  const model = params?.modelName || params?.model?.name || booking?.modelName;
  const head = [brand, model].filter(Boolean).join(' ');
  const ramLabel = params?.ramLabel || booking?.ramLabel;
  const storageLabel = params?.storageLabel || booking?.storageLabel;
  const specs = [ramLabel, storageLabel].filter(Boolean);
  if (specs.length === 0) return head;
  return head ? `${head} · ${specs.join(' · ')}` : specs.join(' · ');
}

function base64ImageUri(raw) {
  if (!raw) return null;
  const value = String(raw);
  return value.startsWith('data:') ? value : `data:image/png;base64,${value}`;
}

// The `video` slot's field (videoUrl) is reused by the "Coverage Photo" flow,
// so a stored URL may be an image, not a video. Decide the preview by the actual
// file extension instead of the slot's intent — otherwise a coverage photo
// renders as a black "VIDEO" placeholder box.
function looksLikeVideo(url) {
  if (!url) return false;
  return /\.(mp4|mov|m4v|webm|avi|3gp)(\?|$)/i.test(String(url));
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

export default function PickupDeviceInformationScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const params = route?.params || {};
  const booking = params.booking || null;
  const bookingId = params.bookingId || booking?.id;
  const services = params.services || [];
  const total = services.reduce((sum, s) => sum + (Number(s.price) || 0), 0);
  const imageUri = deviceImageUri(booking, params);
  const colorText = params.color || booking?.color || null;

  const [photos, setPhotos] = useState(() => {
    const p = params.prefillDevicePhotos;
    return p && typeof p === 'object' ? { ...p } : {};
  });
  const [uploading, setUploading] = useState(null);

  const pick = async (slot) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      notify('Permission needed', 'Allow media library access to attach photos.');
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: slot.isVideo ? ['videos'] : ['images'],
        allowsEditing: false,
        quality: 0.7,
        videoMaxDuration: 30,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setUploading(slot.key);
      const res = await uploadMedia({
        uri: asset.uri,
        name: asset.fileName,
        type: asset.mimeType || (slot.isVideo ? 'video/mp4' : 'image/jpeg'),
        folder: `pickup-estimates/${bookingId}`,
        slot: slot.key,
      });
      const url = res?.url || res?.secure_url;
      if (!url) throw new Error('Upload returned no URL');
      setPhotos((m) => ({ ...m, [slot.key]: url }));
    } catch (e) {
      notify('Upload failed', e?.message || 'Try again');
    } finally {
      setUploading(null);
    }
  };

  const remove = (key) => setPhotos((m) => { const n = { ...m }; delete n[key]; return n; });

  const onContinue = () => {
    navigation.navigate('PickupDeviceSecurity', { ...params, devicePhotos: photos });
  };

  return (
    <View className="flex-1 bg-background">
      <ScrollView contentContainerClassName="px-4 pt-4 pb-32">
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

        <Card className="mb-4">
          <Text className="font-bold text-text mb-1">Complaint Issue :</Text>
          <Text className="text-text">{params.complaint || '-'}</Text>
        </Card>

        <Card className="mb-4">
          <Text className="text-text mb-1"><Text className="font-bold">Estimated Approximate Time :</Text> {params.estimatedAt}</Text>
          <Text className="text-text mb-1"><Text className="font-bold">Estimated Delivery Date :</Text> {params.estimatedDelivery}</Text>
          <Text className="text-text"><Text className="font-bold">Customer Repair Approval :</Text> {params.customerApproved ? <Text className="text-success font-bold">Done</Text> : <Text className="text-warning font-bold">Pending</Text>}</Text>
        </Card>

        <Card>
          <Text className="font-bold text-text mb-2">Device Photo's</Text>
          <View className="flex-row">
            {SLOTS.map((slot) => {
              const url = photos[slot.key];
              const busy = uploading === slot.key;
              return (
                <View key={slot.key} className="flex-1 mx-1 items-center">
                  <Pressable
                    onPress={() => pick(slot)}
                    disabled={busy}
                    className={`w-full border border-dashed rounded-xl items-center justify-center bg-background overflow-hidden ${url ? 'border-primary' : 'border-primary/60'}`}
                    style={{ height: 96 }}
                  >
                    {busy ? (
                      <ActivityIndicator color="#00008B" />
                    ) : url ? (
                      <>
                        {looksLikeVideo(url) ? (
                          <View className="absolute inset-0 bg-text/90 items-center justify-center">
                            <Ionicons name="videocam" size={24} color="#fff" />
                            <Text className="text-white font-bold mt-0.5" style={{ fontSize: rf(9) }}>VIDEO</Text>
                          </View>
                        ) : (
                          <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                        )}
                        <Pressable
                          onPress={() => remove(slot.key)}
                          className="absolute right-1 top-1 h-5 w-5 rounded-full bg-black/60 items-center justify-center"
                        >
                          <Ionicons name="close" size={12} color="#fff" />
                        </Pressable>
                      </>
                    ) : (
                      <>
                        <Ionicons name={slot.isVideo ? 'videocam-outline' : 'image-outline'} size={28} color="#94A3B8" />
                        <Text className="text-text-muted mt-1" style={{ fontSize: rf(10) }}>+ Add</Text>
                      </>
                    )}
                  </Pressable>
                  <Text className="text-xs text-text-muted mt-1 text-center" numberOfLines={2}>{slot.label}</Text>
                </View>
              );
            })}
          </View>
        </Card>
      </ScrollView>

      <View className="absolute left-0 right-0 bottom-0 p-4 bg-card border-t border-border" style={{ paddingBottom: Math.max(insets.bottom, 12) + 10 }}>
        <Button
          rightIcon={<Ionicons name="chevron-forward" size={20} color="#fff" />}
          onPress={onContinue}
          disabled={!!uploading}
        >
          Continue
        </Button>
      </View>
    </View>
  );
}
