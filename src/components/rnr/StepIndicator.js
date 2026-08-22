import React from 'react';
import { Text, View } from 'react-native';
import { cn } from './cn';
import { rf } from '../../utils/responsive';

export function StepIndicator({ steps = 4, current = 0, className }) {
  return (
    <View className={cn('flex-row items-center', className)}>
      {Array.from({ length: steps }).map((_, i) => (
        <React.Fragment key={i}>
          <View
            className={cn(
              'h-7 w-7 rounded-full items-center justify-center',
              i <= current ? 'bg-primary' : 'bg-border',
            )}
          >
            <Text style={{ fontSize: rf(11) }} className={cn('font-extrabold', i <= current ? 'text-white' : 'text-text-muted')}>
              {i + 1}
            </Text>
          </View>
          {i < steps - 1 ? (
            <View className={cn('flex-1 h-1 mx-1 rounded-full', i < current ? 'bg-primary' : 'bg-border')} />
          ) : null}
        </React.Fragment>
      ))}
    </View>
  );
}
