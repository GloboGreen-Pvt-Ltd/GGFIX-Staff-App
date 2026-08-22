import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { cn } from './cn';
import { rf } from '../../utils/responsive';

const shadow = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.05,
  shadowRadius: 6,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
};

export function ScreenHeader({ title, subtitle, onBack, right, className, transparent = false }) {
  return (
    <View
      className={cn(
        transparent ? 'bg-transparent' : 'bg-card border-b border-border',
        'flex-row items-center px-3 py-2',
        className,
      )}
      style={transparent ? null : shadow}
    >
      {onBack ? (
        <Pressable
          onPress={onBack}
          className="h-8 w-8 items-center justify-center rounded-full bg-background active:opacity-70"
        >
          <ChevronLeft size={18} color="#0F172A" />
        </Pressable>
      ) : (
        <View className="h-8 w-8" />
      )}
      <View className="flex-1 px-2">
        <Text numberOfLines={1} className="text-center font-extrabold text-text" style={{ fontSize: rf(14) }}>{title}</Text>
        {subtitle ? (
          <Text numberOfLines={1} className="text-center text-text-muted mt-0.5" style={{ fontSize: rf(10) }}>{subtitle}</Text>
        ) : null}
      </View>
      <View className="h-8 min-w-8 items-end justify-center">{right}</View>
    </View>
  );
}
