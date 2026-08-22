import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { cn } from './cn';
import { rf } from '../../utils/responsive';

const palettes = {
  blue: ['#EEF2FF', '#E0E7FF'],
  emerald: ['#ECFDF5', '#D1FAE5'],
  amber: ['#FFFBEB', '#FEF3C7'],
  rose: ['#FFF1F2', '#FFE4E6'],
  violet: ['#F5F3FF', '#E0E7FF'],
  sky: ['#F0F9FF', '#E0F2FE'],
};

export function ServiceCategoryCard({
  label,
  caption,
  icon,
  palette = 'blue',
  onPress,
  className,
  badge,
  size = 'md',
}) {
  const colors = palettes[palette] || palettes.blue;
  const padding = size === 'sm' ? 'p-3' : 'p-4';
  return (
    <Pressable
      onPress={onPress}
      className={cn('rounded-2xl overflow-hidden border border-border', className)}
      style={{ shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}
    >
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View className={padding}>
          {badge ? (
            <View className="self-start bg-danger rounded-full px-2 py-0.5 mb-1">
              <Text className="font-bold text-white tracking-wide" style={{ fontSize: rf(9) }}>{badge}</Text>
            </View>
          ) : null}
          {icon ? <View className="mb-2">{icon}</View> : null}
          <Text className="font-extrabold text-text" style={{ fontSize: rf(13) }} numberOfLines={2}>{label}</Text>
          {caption ? (
            <Text className="text-text-muted mt-0.5" style={{ fontSize: rf(11) }} numberOfLines={1}>{caption}</Text>
          ) : null}
        </View>
      </LinearGradient>
    </Pressable>
  );
}
