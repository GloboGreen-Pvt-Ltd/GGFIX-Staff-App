import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { cn } from './cn';
import { rf } from '../../utils/responsive';

export function Chip({ label, active = false, onPress, leftIcon, className }) {
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      className={cn(
        'flex-row items-center rounded-full border px-3.5 py-2 mr-2 mb-2',
        active ? 'bg-primary border-primary' : 'bg-card border-border',
        className,
      )}
    >
      {leftIcon ? <View className="mr-1.5">{leftIcon}</View> : null}
      <Text style={{ fontSize: rf(12) }} className={cn('font-semibold', active ? 'text-white' : 'text-text')}>{label}</Text>
    </Wrapper>
  );
}
