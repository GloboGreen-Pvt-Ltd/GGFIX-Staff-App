import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { cn } from './cn';
import { rf } from '../../utils/responsive';

export function Loader({ label, className, inline = false }) {
  if (inline) {
    return (
      <View className={cn('flex-row items-center py-2', className)}>
        <ActivityIndicator color="#00008B" size="small" />
        {label ? <Text className="ml-2 text-text-muted" style={{ fontSize: rf(12) }}>{label}</Text> : null}
      </View>
    );
  }
  return (
    <View className={cn('flex-1 items-center justify-center bg-background', className)}>
      <ActivityIndicator color="#00008B" size="large" />
      {label ? <Text className="mt-3 text-text-muted" style={{ fontSize: rf(13) }}>{label}</Text> : null}
    </View>
  );
}
