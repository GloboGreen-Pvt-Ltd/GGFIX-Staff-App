import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Star, MapPin, Phone, Navigation, Clock } from 'lucide-react-native';
import { cn } from './cn';
import { Badge } from './Badge';
import { rf } from '../../utils/responsive';

const cardShadow = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.06,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 4 },
  elevation: 3,
};

// "0.2956…" -> "296 m"; "1.2345" -> "1.2 km". Returns null when not usable.
function formatDistance(d) {
  if (d === null || d === undefined || d === '') return null;
  const n = Number(d);
  if (!isFinite(n) || n < 0) return null;
  if (n < 0.05) return '< 50 m';
  return n < 1 ? `${Math.round(n * 1000)} m` : `${n.toFixed(1)} km`;
}

export function ShopCard({
  name,
  address,
  rating,
  reviews,
  distance,
  eta,
  etaText,
  travelTimes,
  open = true,
  onPress,
  onCall,
  onDirections,
  className,
}) {
  return (
    <Pressable
      onPress={onPress}
      className={cn('bg-card rounded-2xl border border-border p-4', className)}
      style={cardShadow}
    >
      <View className="flex-row items-start">
        <View className="h-12 w-12 rounded-xl bg-primary/10 items-center justify-center mr-3">
          <Text className="text-base font-extrabold text-primary">{(name || '?').slice(0, 1).toUpperCase()}</Text>
        </View>
        <View className="flex-1">
          <View className="flex-row items-center mb-1">
            <Text className="font-extrabold text-text flex-1" style={{ fontSize: rf(15) }} numberOfLines={1}>{name}</Text>
            <Badge variant={open ? 'softSuccess' : 'softDanger'}>
              {open ? 'OPEN' : 'CLOSED'}
            </Badge>
          </View>
          {address ? (
            <View className="flex-row items-center mt-0.5">
              <MapPin size={12} color="#64748B" />
              <Text className="text-text-muted ml-1 flex-1" style={{ fontSize: rf(12) }} numberOfLines={1}>{address}</Text>
            </View>
          ) : null}
          <View className="flex-row items-center mt-2">
            {rating ? (
              <View className="flex-row items-center bg-success/10 rounded-full px-2 py-0.5 mr-2">
                <Star size={11} color="#004C40" fill="#004C40" />
                <Text className="font-bold text-success ml-1" style={{ fontSize: rf(11) }}>
                  {Number(rating).toFixed(1)}
                </Text>
                {reviews ? <Text className="text-success/80 ml-1" style={{ fontSize: rf(11) }}>({reviews})</Text> : null}
              </View>
            ) : null}
            {formatDistance(distance) ? (
              <Text className="text-text-muted mr-2" style={{ fontSize: rf(11) }}>{formatDistance(distance)}</Text>
            ) : null}
            {!travelTimes?.length && (etaText || eta) ? (
              <View className="flex-row items-center">
                <Clock size={11} color="#64748B" />
                <Text className="text-text-muted ml-1" style={{ fontSize: rf(11) }}>{etaText || `${eta} min`}</Text>
              </View>
            ) : null}
          </View>

          {/* Per-mode travel times from the customer's location to this shop */}
          {travelTimes?.length ? (
            <View className="flex-row items-center mt-1.5">
              {travelTimes.map((t) => {
                const TIcon = t.Icon;
                return (
                  <View key={t.key} className="flex-row items-center mr-4">
                    {TIcon ? <TIcon size={13} color="#64748B" /> : null}
                    <Text className="font-bold text-text ml-1" style={{ fontSize: rf(11) }}>{t.text}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
      </View>
      {(onCall || onDirections) ? (
        <View className="flex-row mt-3 border-t border-border pt-2 -mx-1">
          {onCall ? (
            <Pressable onPress={onCall} className="flex-1 flex-row items-center justify-center py-2 active:opacity-70">
              <Phone size={15} color="#004C40" />
              <Text className="ml-2 font-bold text-success" style={{ fontSize: rf(13) }}>Call</Text>
            </Pressable>
          ) : null}
          {onDirections ? (
            <Pressable onPress={onDirections} className="flex-1 flex-row items-center justify-center py-2 active:opacity-70 border-l border-border">
              <Navigation size={15} color="#2563EB" />
              <Text className="ml-2 font-bold text-secondary" style={{ fontSize: rf(13) }}>Directions</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}
