import React from 'react';
import { Text, View } from 'react-native';
import { cn } from './cn';
import { rf } from '../../utils/responsive';

export function PriceRow({ label, value, bold = false, className, valueClassName, muted = false, strikethrough = false }) {
  return (
    <View className={cn('flex-row items-center justify-between py-2', className)}>
      <Text style={{ fontSize: rf(13) }} className={cn(
        bold ? 'font-extrabold text-text' : muted ? 'text-text-muted' : 'text-text',
      )}>
        {label}
      </Text>
      <Text
        style={{ fontSize: rf(13) }}
        className={cn(
          bold ? 'font-extrabold text-text' : muted ? 'text-text-muted' : 'text-text',
          strikethrough && 'line-through',
          valueClassName,
        )}
      >
        {value}
      </Text>
    </View>
  );
}

export function PriceDivider({ className }) {
  return <View className={cn('h-px bg-border my-1', className)} />;
}
