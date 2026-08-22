import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, Text, View } from 'react-native';
import { Check, Smartphone } from 'lucide-react-native';
import { Card, SearchBar } from '../components/rnr';
import { listModelsForBrand } from '../api/master';
import { normalizeDeviceImageUrl } from '../utils/images';
import { rf } from '../utils/responsive';

function trackingId(booking) {
  return booking?.bookingNumber
    || `#${String(booking?.id || '').replace(/[^0-9a-zA-Z]/g, '').slice(0, 12).toUpperCase()}`;
}

function modelImageUri(model) {
  if (!model) return null;
  const url = normalizeDeviceImageUrl(model.imageUrl);
  if (url) return url;
  const b64 = model.imageBase64;
  if (!b64) return null;
  return String(b64).startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
}

export default function PickupSelectModelScreen({ navigation, route }) {
  const params = route?.params || {};
  const booking = params.booking || null;
  const brandId = params.brandId || null;
  const brandName = params.brandName || params.brand?.name || null;
  // Highlight the model the customer originally picked, when the technician
  // is still on the customer-chosen brand. Once they switch brand we don't
  // pretend the old model still applies.
  const sameBrandAsBooking = booking?.brandId
    ? String(booking.brandId) === String(brandId)
    : false;
  const currentModelId = sameBrandAsBooking
    ? (booking?.modelId || params.modelId || null)
    : null;
  const currentModelName = sameBrandAsBooking
    ? (booking?.modelName || params.modelName || null)
    : null;
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const list = brandId ? await listModelsForBrand(brandId) : [];
        if (!cancelled) setModels(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setModels([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [brandId]);

  // Float the customer's prior model to the top of the grid — saves the
  // technician a scroll when they're confirming the original entry.
  const sortedModels = useMemo(() => {
    if (!currentModelId) return models;
    const idx = models.findIndex((m) => String(m.id) === String(currentModelId));
    if (idx <= 0) return models;
    const next = [...models];
    const [pick] = next.splice(idx, 1);
    next.unshift(pick);
    return next;
  }, [models, currentModelId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedModels;
    return sortedModels.filter((m) => (m.name || '').toLowerCase().includes(q));
  }, [sortedModels, query]);

  const onSelect = (model) => {
    navigation.navigate('PickupDeviceColorStorage', {
      ...params,
      modelId: model?.id || null,
      modelName: model?.name || null,
      modelImageUrl: model?.imageUrl || null,
      modelImageBase64: model?.imageBase64 || null,
      model,
    });
  };

  const renderItem = ({ item }) => {
    const uri = modelImageUri(item);
    const isCurrent = currentModelId && String(item.id) === String(currentModelId);
    return (
      <Pressable
        onPress={() => onSelect(item)}
        className="flex-1 mx-1.5 mb-3"
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
      >
        <Card padded={false} className={`overflow-hidden ${isCurrent ? 'border-primary' : ''}`}>
          {isCurrent ? (
            <View className="px-2 py-0.5 bg-primary flex-row items-center justify-center">
              <Check size={9} color="#FFFFFF" />
              <Text className="text-white font-extrabold tracking-widest ml-1" style={{ fontSize: rf(8) }}>
                CUSTOMER PICKED
              </Text>
            </View>
          ) : null}
          <View className="p-3 items-center">
            <View className="w-14 h-14 rounded-xl bg-background items-center justify-center mb-2 overflow-hidden">
              {uri ? (
                <Image source={{ uri }} style={{ width: 48, height: 48 }} resizeMode="contain" />
              ) : (
                <Smartphone size={26} color="#00008B" />
              )}
            </View>
            <Text
              style={{ fontSize: rf(11) }}
              className={`font-extrabold text-center ${isCurrent ? 'text-primary' : 'text-text'}`}
              numberOfLines={2}
            >
              {item.name || 'Model'}
            </Text>
          </View>
        </Card>
      </Pressable>
    );
  };

  return (
    <View className="flex-1 bg-background">
      <View className="px-4 pt-3 pb-2">
        <Card className="flex-row items-center mb-3">
          <View className="w-11 h-11 rounded-xl bg-primary/10 items-center justify-center mr-3">
            <Smartphone size={20} color="#00008B" />
          </View>
          <View className="flex-1">
            <Text className="text-text-muted uppercase tracking-widest font-bold" style={{ fontSize: rf(10) }}>
              Tracking
            </Text>
            <Text className="font-extrabold text-text mt-0.5" style={{ fontSize: rf(13) }} numberOfLines={1}>
              {trackingId(booking)}
            </Text>
            <Text className="text-text-muted mt-0.5" style={{ fontSize: rf(11) }} numberOfLines={1}>
              Brand · <Text className="font-bold text-text">{brandName || '—'}</Text>
            </Text>
            {currentModelName ? (
              <View className="flex-row items-center mt-1.5 self-start bg-primary/10 border border-primary/30 rounded-full pl-1.5 pr-2.5 py-0.5">
                <View className="w-3.5 h-3.5 rounded-full bg-primary items-center justify-center mr-1">
                  <Check size={9} color="#FFFFFF" />
                </View>
                <Text className="text-primary font-extrabold tracking-wide" style={{ fontSize: rf(10) }}>
                  Customer picked {currentModelName}
                </Text>
              </View>
            ) : null}
          </View>
        </Card>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search model by name"
          onClear={() => setQuery('')}
        />
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#00008B" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 4, paddingBottom: 36 }}
          ListEmptyComponent={
            <Text className="text-text-muted text-center mt-12" style={{ fontSize: rf(12) }}>
              {brandId ? 'No models for this brand.' : 'Select a brand to see models.'}
            </Text>
          }
        />
      )}
    </View>
  );
}
