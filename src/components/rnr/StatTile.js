import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { cn } from './cn';
import { rf } from '../../utils/responsive';

const palettes = {
  primary: { bg: 'bg-primary/10', text: 'text-primary' },
  success: { bg: 'bg-success/10', text: 'text-success' },
  warning: { bg: 'bg-warning/10', text: 'text-warning' },
  danger: { bg: 'bg-danger/10', text: 'text-danger' },
  secondary: { bg: 'bg-secondary/10', text: 'text-secondary' },
};

export function StatTile({ icon, label, value, palette = 'primary', onPress, className }) {
  const p = palettes[palette] || palettes.primary;
  const Wrapper = onPress ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      className={cn('flex-1 bg-card rounded-2xl border border-border p-3', className)}
      style={{ shadowColor: '#0F172A', shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 }}
    >
      <View className={cn('h-9 w-9 rounded-full items-center justify-center mb-2', p.bg)}>
        {icon}
      </View>
      <Text className="text-text-muted" style={{ fontSize: rf(11) }}>{label}</Text>
      <Text style={{ fontSize: rf(17) }} className={cn('font-extrabold mt-0.5', p.text)}>{value}</Text>
    </Wrapper>
  );
}
