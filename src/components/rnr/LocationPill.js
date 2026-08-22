import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { MapPin, ChevronDown } from 'lucide-react-native';
import { cn } from './cn';
import { rf } from '../../utils/responsive';

export function LocationPill({ label = 'Home', sub, onPress, className }) {
  return (
    <Pressable onPress={onPress} className={cn('flex-row items-center active:opacity-70', className)}>
      <View className="h-10 w-10 rounded-full bg-primary/10 items-center justify-center mr-2">
        <MapPin size={18} color="#00008B" />
      </View>
      <View className="max-w-[78%]">
        <View className="flex-row items-center">
          <Text numberOfLines={1} className="font-extrabold text-text mr-1" style={{ fontSize: rf(15) }}>{label}</Text>
          <ChevronDown size={16} color="#0F172A" />
        </View>
        {sub ? (
          <Text numberOfLines={1} className="text-text-muted mt-0.5" style={{ fontSize: rf(11) }}>{sub}</Text>
        ) : null}
      </View>
    </Pressable>
  );
}
