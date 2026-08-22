import React from 'react';
import { View, Text } from 'react-native';
import { cn } from './cn';
import { rf } from '../../utils/responsive';

const shadow = {
  shadowColor: '#0F172A',
  shadowOpacity: 0.05,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
};

export function Card({ className, children, padded = true, ...rest }) {
  return (
    <View
      {...rest}
      className={cn('bg-card rounded-2xl border border-border', padded && 'p-3', className)}
      style={[shadow, rest.style]}
    >
      {children}
    </View>
  );
}

export function CardHeader({ className, children }) {
  return <View className={cn('mb-2', className)}>{children}</View>;
}

export function CardTitle({ className, children }) {
  return <Text style={{ fontSize: rf(14) }} className={cn('font-extrabold text-text', className)}>{children}</Text>;
}

export function CardDescription({ className, children }) {
  return <Text style={{ fontSize: rf(12) }} className={cn('text-text-muted mt-0.5', className)}>{children}</Text>;
}

export function CardDivider({ className }) {
  return <View className={cn('h-px bg-border my-2', className)} />;
}
