import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { cn } from './cn';

export function Checkbox({ checked, onChange, label, className, disabled = false, color = 'success' }) {
  const tone = color === 'primary' ? 'bg-primary border-primary' : 'bg-success border-success';
  return (
    <Pressable
      disabled={disabled}
      onPress={() => onChange?.(!checked)}
      className={cn('flex-row items-center', disabled && 'opacity-50', className)}
    >
      <View
        className={cn(
          'h-5 w-5 rounded-md border-2 items-center justify-center',
          checked ? tone : 'bg-card border-border',
        )}
      >
        {checked ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
      </View>
      {label ? <Text className="ml-2 text-sm text-text-muted">{label}</Text> : null}
    </Pressable>
  );
}
