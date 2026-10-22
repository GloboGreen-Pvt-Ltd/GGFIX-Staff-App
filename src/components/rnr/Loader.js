import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Text } from '../Typography';
import { cn } from './cn';
import { rf } from '../../utils/responsive';

export function Loader({ label, className, inline = false }) {
  if (inline) {
    return (
      <View className={cn('flex-row items-center py-2', className)}>
        <ActivityIndicator color="#035C6C" size="small" />
        {label ? <Text className="ml-2 text-text-muted" style={{ fontSize: rf(12) }}>{label}</Text> : null}
      </View>
    );
  }
  return (
    <View className={cn('flex-1 items-center justify-center bg-background', className)}>
      <ActivityIndicator color="#035C6C" size="large" />
      {label ? <Text className="mt-3 text-text-muted" style={{ fontSize: rf(13) }}>{label}</Text> : null}
    </View>
  );
}
