import React from 'react';
import { View, Text, Image } from 'react-native';
import { cn } from './cn';

export function Avatar({ source, fallback, size = 40, className, gradient = false }) {
  const inner = source ? (
    <Image
      source={typeof source === 'string' ? { uri: source } : source}
      style={{ width: size, height: size }}
    />
  ) : (
    <Text className="text-white font-extrabold" style={{ fontSize: size * 0.36 }}>
      {(fallback || '?').slice(0, 2).toUpperCase()}
    </Text>
  );
  return (
    <View
      className={cn(
        'items-center justify-center overflow-hidden',
        source ? 'bg-border' : 'bg-primary',
        className,
      )}
      style={{ width: size, height: size, borderRadius: size / 2 }}
    >
      {inner}
    </View>
  );
}
