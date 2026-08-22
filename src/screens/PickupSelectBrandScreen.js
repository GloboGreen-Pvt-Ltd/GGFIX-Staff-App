import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, Text, View } from 'react-native';
import { Card, SearchBar } from '../components/rnr';
import { Check, Smartphone } from 'lucide-react-native';
import { listBrands, listBrandsForCategory } from '../api/master';
import { rf } from '../utils/responsive';

function trackingId(booking) {
  return booking?.bookingNumber
    || `#${String(booking?.id || '').replace(/[^0-9a-zA-Z]/g, '').slice(0, 12).toUpperCase()}`;
}

function brandImageUri(brand) {
  if (!brand) return null;
  if (brand.iconUrl) return brand.iconUrl;
  if (brand.imageUrl) return brand.imageUrl;
  const b64 = brand.iconBase64 || brand.imageBase64;
  if (!b64) return null;
  return String(b64).startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
}

export default function PickupSelectBrandScreen({ navigation, route }) {
  const params = route?.params || {};
  const booking = params.booking || null;
  const categoryHint = params.deviceCategoryId
    || params.deviceCategoryCode
    || booking?.deviceCategoryId
    || booking?.deviceCategoryCode
    || null;
  // Brand the customer already picked when creating the booking — surface it
  // as a "Current selection" hint inside the header and as a check overlay on
  // the matching tile so the pickup person can confirm in one tap.
  const currentBrandId = params.brandId || booking?.brandId || null;
  const currentBrandName = params.brandName || booking?.brandName || null;
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const list = categoryHint
          ? await listBrandsForCategory(categoryHint)
          : await listBrands();
        if (!cancelled) setBrands(Array.isArray(list) ? list : []);
      } catch {
        if (!cancelled) setBrands([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [categoryHint]);

  // Surface the customer's current brand at the top of the list so the
  // pickup person doesn't have to scroll to confirm it.
  const sortedBrands = useMemo(() => {
    if (!currentBrandId) return brands;
    const idx = brands.findIndex((b) => String(b.id) === String(currentBrandId));
    if (idx <= 0) return brands;
    const next = [...brands];
    const [pick] = next.splice(idx, 1);
    next.unshift(pick);
    return next;
  }, [brands, currentBrandId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sortedBrands;
    return sortedBrands.filter((b) => (b.name || '').toLowerCase().includes(q));
  }, [sortedBrands, query]);

  const onSelect = (brand) => {
    navigation.navigate('PickupSelectModel', {
      ...params,
      brandId: brand?.id || null,
      brandName: brand?.name || null,
      brand,
    });
  };

  const renderItem = ({ item }) => {
    const uri = brandImageUri(item);
    const isCurrent = currentBrandId && String(item.id) === String(currentBrandId);
    return (
      <Pressable
        onPress={() => onSelect(item)}
        className="flex-1 mx-1.5 mb-3"
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
      >
        <Card
          padded={false}
          className={`overflow-hidden ${isCurrent ? 'border-primary' : ''}`}
        >
          {isCurrent ? (
            <View className="px-2 py-0.5 bg-primary flex-row items-center justify-center">
              <Check size={9} color="#FFFFFF" />
              <Text className="text-white font-extrabold tracking-widest ml-1" style={{ fontSize: rf(8) }}>
                CUSTOMER PICKED
              </Text>
            </View>
          ) : null}
          <View className="p-3 items-center">
            <View className="w-12 h-12 rounded-xl bg-background items-center justify-center mb-2 overflow-hidden">
              {uri ? (
                <Image source={{ uri }} style={{ width: 40, height: 40 }} resizeMode="contain" />
              ) : (
                <Smartphone size={22} color="#00008B" />
              )}
            </View>
            <Text
              style={{ fontSize: rf(12) }}
              className={`font-extrabold text-center ${isCurrent ? 'text-primary' : 'text-text'}`}
              numberOfLines={1}
            >
              {item.name || 'Brand'}
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
            {booking?.customerName ? (
              <Text className="text-text-muted mt-0.5" style={{ fontSize: rf(11) }} numberOfLines={1}>
                Customer · <Text className="font-bold text-text">{booking.customerName}</Text>
              </Text>
            ) : null}
            {currentBrandName ? (
              <View className="flex-row items-center mt-1.5 self-start bg-primary/10 border border-primary/30 rounded-full pl-1.5 pr-2.5 py-0.5">
                <View className="w-3.5 h-3.5 rounded-full bg-primary items-center justify-center mr-1">
                  <Check size={9} color="#FFFFFF" />
                </View>
                <Text className="text-primary font-extrabold tracking-wide" style={{ fontSize: rf(10) }}>
                  Customer picked {currentBrandName}
                </Text>
              </View>
            ) : null}
          </View>
        </Card>
        <SearchBar
          value={query}
          onChangeText={setQuery}
          placeholder="Search brand by name"
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
              No brands found.
            </Text>
          }
        />
      )}
    </View>
  );
}
