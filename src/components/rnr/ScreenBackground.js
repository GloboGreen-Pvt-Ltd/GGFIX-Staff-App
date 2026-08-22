import React from 'react';
import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { cn } from './cn';

/**
 * Soft pink → lavender → blue gradient backdrop, matching the booking-flow
 * screenshots. Wrap a screen body with this and let children sit on top.
 */
export function ScreenBackground({ children, className, variant = 'default' }) {
  const colors = variant === 'cool'
    ? ['#F8FAFC', '#EFF6FF', '#F5F3FF']
    : ['#FCE7F3', '#F5F3FF', '#DBEAFE'];
  return (
    <View className={cn('flex-1', className)}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />
      {children}
    </View>
  );
}
